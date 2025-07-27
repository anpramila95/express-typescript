import Event from '../providers/Event';
import { events } from './definitions';

// Import các listener của bạn
import UserListener from './listeners/UserListener';
// import TransactionListener from './listeners/TransactionListener';

export const RegisterEvents = () => {
    // Đăng ký các sự kiện liên quan đến User
    Event.on(events.user.created, UserListener.onUserCreated);
    Event.on(events.user.updated, UserListener.onUserUpdated);
    Event.on(events.user.loggedIn, UserListener.onUserLoggedIn);
    
    
    // Đăng ký các sự kiện liên quan đến Transaction
    // Event.on(events.transaction.approved, TransactionListener.onTransactionApproved);

    console.log('Registered all application events!');
};