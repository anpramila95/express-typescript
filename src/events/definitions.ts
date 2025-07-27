export const events = {
    user: {
        created: 'user.created',
        updated: 'user.updated',
        deleted: 'user.deleted',
        passwordReset: 'user.passwordReset',
        emailVerified: 'user.emailVerified',
        profileUpdated: 'user.profileUpdated',
        accountDeactivated: 'user.accountDeactivated',
        accountReactivated: 'user.accountReactivated',
        twoFactorEnabled: 'user.twoFactorEnabled',
        twoFactorDisabled: 'user.twoFactorDisabled',
        roleChanged: 'user.roleChanged',
        permissionsUpdated: 'user.permissionsUpdated',
        logout: 'user.logout',
        sessionCreated: 'user.sessionCreated',
        sessionDeleted: 'user.sessionDeleted',
        passwordChanged: 'user.passwordChanged',
        profilePictureUpdated: 'user.profilePictureUpdated',
        accountLocked: 'user.accountLocked',
        accountUnlocked: 'user.accountUnlocked',
        accountSuspended: 'user.accountSuspended',
        accountRestored: 'user.accountRestored',
        loggedIn: 'user.loggedIn',
    },
    transaction: {
        approved: 'transaction.approved',
        rejected: 'transaction.rejected',
    }
    // Thêm các sự kiện khác ở đây
};