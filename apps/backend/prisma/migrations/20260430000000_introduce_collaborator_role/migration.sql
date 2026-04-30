-- Rename existing 'member' role to 'collaborator' in InitiativeMember.
-- Existing members retain full task visibility (collaborator behaviour).
-- New invitees added going forward will receive the restricted 'member' role.
UPDATE "InitiativeMember" SET role = 'collaborator' WHERE role = 'member';

-- Mirror the rename in pending invitations so accepted invites land on 'collaborator'.
UPDATE "InitiativeInvitation" SET role = 'collaborator' WHERE role = 'member';
