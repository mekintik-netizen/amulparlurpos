/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compatibility wrapper redirecting legacy AdminPhone2FAModal imports
 * to the hardened AdminGmail2FAModal (zero SMS fallback, zero test OTP).
 */

import React from 'react';
import { AdminGmail2FAModal } from './AdminGmail2FAModal.tsx';

interface AdminPhone2FAModalProps {
  isOpen: boolean;
  phoneNumber?: string;
  adminEmail?: string;
  onVerified: (verificationToken?: string) => void;
  onCancel: () => void;
}

export const AdminPhone2FAModal: React.FC<AdminPhone2FAModalProps> = ({
  isOpen,
  adminEmail,
  onVerified,
  onCancel
}) => {
  return (
    <AdminGmail2FAModal
      isOpen={isOpen}
      adminEmail={adminEmail}
      onVerified={onVerified}
      onCancel={onCancel}
    />
  );
};
