import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { runAllTests } from '@/lib/workflows/test-all-features';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/test
 * Run comprehensive test suite for workflow system
 */
export async function POST() {
  try {
    const results = await runAllTests();

    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.values(results).length;

    return NextResponse.json({
      success: passed === total,
      results,
      summary: {
        passed,
        total,
        percentage: Math.round((passed / total) * 100),
      },
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'workflow_test_suite_failed'
      },
      'Test suite error'
    );
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
