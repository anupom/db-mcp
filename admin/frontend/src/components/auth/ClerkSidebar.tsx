import { UserButton, OrganizationSwitcher } from '@clerk/clerk-react';

/**
 * Clerk sidebar controls — only rendered when auth is enabled (inside ClerkProvider).
 */
export function ClerkSidebar() {
  return (
    <div className="p-4 border-t border-gray-700 space-y-3">
      <OrganizationSwitcher
        hidePersonal
        appearance={{
          elements: {
            rootBox: 'w-full',
            organizationSwitcherTrigger: 'w-full justify-start text-gray-300 hover:text-white',
          },
        }}
      />
      <UserButton
        appearance={{
          elements: {
            rootBox: 'w-full',
            userButtonTrigger: 'w-full justify-start text-gray-300 hover:text-white',
          },
        }}
      />
    </div>
  );
}
