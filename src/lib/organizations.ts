import { db } from './db';
import { organizationsTable, organizationMembersTable, type Organization, type OrganizationMember } from './schema';
import { eq, and } from 'drizzle-orm';
import slugify from 'slugify';

// Use Web Crypto API for Edge Runtime compatibility
const getRandomUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for Node.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('crypto').randomUUID();
};

export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * Create a new organization
 */
export async function createOrganization(
  name: string,
  ownerId: string,
  plan: 'free' | 'pro' | 'enterprise' = 'free'
): Promise<Organization> {
  const id = getRandomUUID();

  // Generate unique slug
  let slug = slugify(name, { lower: true, strict: true });

  // Check if slug exists, append number if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (db as any)
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    slug = `${slug}-${Date.now()}`;
  }

  // Create organization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).insert(organizationsTable).values({
    id,
    name,
    slug,
    ownerId,
    plan,
    settings: {},
  });

  // Add owner as member
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).insert(organizationMembersTable).values({
    id: getRandomUUID(),
    organizationId: id,
    userId: ownerId,
    role: 'owner',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [org] = await (db as any)
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, id))
    .limit(1);

  return org as Organization;
}

/**
 * Get all organizations a user belongs to
 */
export async function getUserOrganizations(userId: string): Promise<Array<Organization & { role: OrganizationRole }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberships = await (db as any)
    .select({
      organization: organizationsTable,
      role: organizationMembersTable.role,
    })
    .from(organizationMembersTable)
    .innerJoin(
      organizationsTable,
      eq(organizationMembersTable.organizationId, organizationsTable.id)
    )
    .where(eq(organizationMembersTable.userId, userId));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return memberships.map((m: any) => ({
    ...m.organization,
    role: m.role as OrganizationRole,
  }));
}

/**
 * Get a specific organization by ID
 */
export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [org] = await (db as any)
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  return org || null;
}

/**
 * Get user's role in an organization
 */
export async function getUserRoleInOrganization(
  userId: string,
  organizationId: string
): Promise<OrganizationRole | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [membership] = await (db as any)
    .select()
    .from(organizationMembersTable)
    .where(
      and(
        eq(organizationMembersTable.userId, userId),
        eq(organizationMembersTable.organizationId, organizationId)
      )
    )
    .limit(1);

  return membership?.role as OrganizationRole || null;
}

/**
 * Check if user has access to an organization
 */
export async function userHasAccessToOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const role = await getUserRoleInOrganization(userId, organizationId);
  return role !== null;
}

/**
 * Get all members of an organization
 */
export async function getOrganizationMembers(organizationId: string): Promise<Array<OrganizationMember>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = await (db as any)
    .select()
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.organizationId, organizationId));

  return members;
}

/**
 * Add a member to an organization
 */
export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: OrganizationRole = 'member'
): Promise<OrganizationMember> {
  const id = getRandomUUID();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).insert(organizationMembersTable).values({
    id,
    organizationId,
    userId,
    role,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [member] = await (db as any)
    .select()
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.id, id))
    .limit(1);

  return member as OrganizationMember;
}

/**
 * Remove a member from an organization
 */
export async function removeOrganizationMember(
  organizationId: string,
  userId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .delete(organizationMembersTable)
    .where(
      and(
        eq(organizationMembersTable.organizationId, organizationId),
        eq(organizationMembersTable.userId, userId)
      )
    );
}

/**
 * Update member role in an organization
 */
export async function updateOrganizationMemberRole(
  organizationId: string,
  userId: string,
  role: OrganizationRole
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .update(organizationMembersTable)
    .set({ role })
    .where(
      and(
        eq(organizationMembersTable.organizationId, organizationId),
        eq(organizationMembersTable.userId, userId)
      )
    );
}

/**
 * Delete an organization (and all members)
 */
export async function deleteOrganization(organizationId: string): Promise<void> {
  // Delete all members first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .delete(organizationMembersTable)
    .where(eq(organizationMembersTable.organizationId, organizationId));

  // Delete organization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .delete(organizationsTable)
    .where(eq(organizationsTable.id, organizationId));
}
