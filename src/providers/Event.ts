import { EventEmitter } from 'events';

class Event extends EventEmitter {
    private static _instance: Event;

    public static getInstance(): Event {
        if (!this._instance) {
            this._instance = new Event();
        }
        return this._instance;
    }
}

export default Event.getInstance();