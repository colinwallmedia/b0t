import { NextRequest } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { executeWorkflowConfig } from '@/lib/workflows/executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Chat AI configuration (can be overridden via env vars)
const CHAT_AI_PROVIDER = (process.env.CHAT_AI_PROVIDER || 'openai') as 'openai' | 'anthropic';
const CHAT_AI_MODEL = process.env.CHAT_AI_MODEL || (CHAT_AI_PROVIDER === 'openai' ? 'gpt-4-turbo' : 'claude-3-5-sonnet-20241022');

/**
 * POST /api/workflows/[id]/chat
 * Chat with AI to execute workflow with natural language
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await params;
  try {
    const { messages } = await request.json();

    logger.info({ workflowId }, 'Chat request received');

    // Fetch workflow
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, workflowId))
      .limit(1);

    if (workflows.length === 0) {
      logger.warn({ workflowId }, 'Workflow not found');
      return new Response('Workflow not found', { status: 404 });
    }

    const workflow = workflows[0];
    const config = typeof workflow.config === 'string'
      ? JSON.parse(workflow.config)
      : workflow.config;

    // Get the last user message - handle both content and parts format
    const lastMessage = messages[messages.length - 1];
    let userInput = '';
    if (lastMessage?.content) {
      userInput = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);
    } else if (lastMessage?.parts) {
      // Handle parts format
      const textParts = (lastMessage.parts as Array<{ type: string; text?: string }>)
        .filter((part) => part.type === 'text')
        .map((part) => part.text || '');
      userInput = textParts.join(' ');
    }

    logger.info({ workflowId, messageCount: messages.length }, 'Starting chat stream');

    // System prompt for the AI
    const systemPrompt = `You are a helpful AI assistant that executes workflows based on user input.

Workflow: ${workflow.name}
Description: ${workflow.description || 'No description'}

Your job is to:
1. Understand the user's request
2. Execute the workflow with appropriate parameters
3. Present the results in a clear, conversational way

Be friendly, concise, and helpful. If the workflow produces data, explain it clearly to the user.

IMPORTANT: When formatting tables, always use proper markdown table syntax:
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

Never use ASCII art tables with + and - characters. Always use the | and - markdown table format.`;

    // Convert messages from parts format to standard format and filter
    type MessageLike = { role: string; content?: unknown; parts?: Array<{ type: string; text?: string }> };
    const formattedMessages = (messages as MessageLike[])
      .filter((msg) => msg.role === 'user') // Only keep user messages
      .map((msg) => {
        // If already has content field, use it
        if (msg.content) {
          return {
            role: 'user' as const,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          };
        }

        // Convert from parts format to content format
        if (msg.parts) {
          const textContent = msg.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text || '')
            .join('\n');

          return {
            role: 'user' as const,
            content: textContent
          };
        }

        // Fallback
        return {
          role: 'user' as const,
          content: ''
        };
      })
      .filter((msg) => msg.content); // Remove empty messages

    // Log the formatted messages for debugging
    logger.info({ workflowId, formattedMessages, provider: CHAT_AI_PROVIDER, model: CHAT_AI_MODEL }, 'Formatted messages for AI');

    // Get the AI model instance based on provider
    const modelInstance = CHAT_AI_PROVIDER === 'openai'
      ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(CHAT_AI_MODEL)
      : createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(CHAT_AI_MODEL);

    // Stream the AI response using AI SDK
    // Note: This uses the AI SDK (from the ai-sdk module) for streaming because:
    // - It's optimized for UI-specific streaming (React components)
    // - It handles SSE/streaming format automatically
    // - The actual workflow execution uses the module system via executeWorkflowConfig
    const result = streamText({
      model: modelInstance,
      system: systemPrompt,
      messages: formattedMessages,
      async onFinish({ text }) {
        logger.info({ workflowId, responseLength: text.length, text }, 'AI response completed, executing workflow');

        // Execute the workflow using the workflow execution engine
        // This properly uses the module system and all workflow infrastructure
        try {
          await executeWorkflowConfig(config, workflow.userId, {
            workflowId: workflow.id,
            userInput,
          });
          logger.info({ workflowId }, 'Workflow executed successfully');
        } catch (error) {
          logger.error({ workflowId, error }, 'Error executing workflow');
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      {
        workflowId,
        error: errorMessage,
        action: 'workflow_chat_failed'
      },
      'Chat API error'
    );
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
