(function() {
    /**
     * Tries to get requestAnimationFrame, and falls back on a setTimeout
     * @type {Function}
     */
    const requestAnimationFrame = window.requestAnimationFrame
                                    || window.webkitRequestAnimationFrame
                                    || window.mozRequestAnimationFrame
                                    || window.msRequestAnimationFrame
                                    || function(cb) { return setTimeout(cb, 16); };

    /**
     * Event listener aliases. Allows you to listen for `author` and get `postAuthor` and `commentAuthor` events,
     * for example.
     * @type {Object.<string, Array<string>>}
     */
    const listenerAliases = {
        'postAuthor': ['author']
    };

    /**
     * We run this inside a try catch
     * so that if any jobs error, we
     * are able to recover and continue
     * to flush the batch until it's empty.
     *
     * @private
     */
    function runTasks(tasks) {
        console.log('run tasks');
        let task; while (task = tasks.shift()) task();
    }

    /**
     * Remove an item from an Array.
     *
     * @param  {Array} array
     * @param  {*} item
     * @return {Boolean}
     */
    function remove(array, item) {
        const index = array.indexOf(item);
        return !!~index && !!array.splice(index, 1);
    }

    class TBListener {
        /**
         * Create a new instance of TBListener. Nothing happens yet until TBListener.start() has been called
         */
        constructor() {
            // Simple array holding callbacks waiting to be handled.
            // If you want to put something in here directly, make sure to call scheduleFlush()
            this.queue = [];

            // Holding areference to the bound function so `removeEventListener` can be called later
            this.boundFunc = this.listener.bind(this);

            // Object holding all registered listeners.
            // Keys are listener names, with arrays of callbacks as their values
            this.listeners = {};

            // Used by stop() and start()
            this.started = false;

            // If you assign a function to this, every single `reddit` event will go to it
            this.debugFunc = null;

            this.scheduled = false;
        }

        /**
         * Starts the TBListener instance by registering an event listener for `reddit` events
         * 
         * A `TBListenerLoaded` event is fired when everything is ready.
         */
        start() {
            if (!this.started) {
                const loadedEvent = new CustomEvent('TBListenerLoaded');
                const readyEvent = new Event('reddit.ready');

                document.addEventListener('reddit', this.boundFunc, true);

                document.dispatchEvent(loadedEvent);
                document.dispatchEvent(readyEvent);

                this.started = true;
            }
        }

        /**
         * Unregisters this instance's event listener
         */
        stop() {
            if (this.started) {
                document.removeEventListener('reddit', this.boundFunc);
                this.started = false;
            }
        }

        /**
         * Register an event listener for a given event name for a callback.
         *
         * @param {string} Name of event
         * @param {TBListener~listenerCallback} Callback
         */
        on(event, callback) {
            if (!this.listeners[event]) {
                this.listeners[event] = [];
            }

            this.listeners[event].push(callback);
        }

        /**
         * Callback for a `reddit` event.
         * The callback's `this` is event.target
         * 
         * @callback TBListener~listenerCallback
         * @param {CustomEvent} event
         * @param {string} responseMessage
         * @this HTMLElement
         */

        /**
         * The function that gets registered as a global event listener for `reddit` events.
         * 
         * @param {CustomEvent}
         * @private
         */
        listener(event) {
            const eventType = event.detail.type;

            // See if there's any registered listeners listening for eventType
            if (Array.isArray(this.listeners[eventType])) {
                for (let listener of this.listeners[eventType]) {
                    this.queue.push(listener.bind(event.target, event));
                }
            }

            // Check and see if there are any aliases for `eventType` and run those on the queue
            if (Array.isArray(listenerAliases[eventType])) {
                for (let alias of listenerAliases[eventType]) {
                    if (Array.isArray(this.listeners[alias])) {
                        for (let listener of this.listeners[alias]) {
                            this.queue.push(listener.bind(event.target, event));
                        }
                    }
                }
            }

            // Run the debug function on the queue, if there's any
            if (this.debugFunc) {
                this.queue.push(this.debugFunc.bind(event.target, event));
            }

            // Flush the queue
            this.scheduleFlush();
        }

        /**
         * Clears a scheduled 'read' or 'write' task.
         *
         * @param {Object} task
         * @return {Boolean} success
         * @public
         */
        clear(task) {
            return remove(this.queue, task);
        }

        /**
         * Schedules a new read/write
         * batch if one isn't pending.
         *
         * @private
         */
        scheduleFlush() {
            if (!this.scheduled) {
                this.scheduled = true;
                requestAnimationFrame(this.flush.bind(this));
            }
        }

        /**
         * Runs queued tasks.
         *
         * Errors are caught and thrown by default.
         * If a `.catch` function has been defined
         * it is called instead.
         *
         * @private
         */
        flush() {
            const queue = this.queue;
            let error;

            try {
                runTasks(queue);
            } catch (e) { error = e; }

            this.scheduled = false;

            // If the batch errored we may still have tasks queued
            if (queue.length) {
                this.scheduleFlush();
            }

            if (error) {
                console.error('task errored', error.message);
                if (this.catch) this.catch(error);
                else throw error;
            }
        }

    }

    window.TBListener = new TBListener();
})();
