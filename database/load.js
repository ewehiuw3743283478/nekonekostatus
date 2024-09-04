'use strict';

/**
 * Pads the array with default objects up to the specified length.
 * @param {Array} arr - The array to pad.
 * @param {number} len - The target length of the array.
 * @returns {Array} - The padded array.
 */
function pad(arr, len) {
    while (arr.length < len) {
        arr.unshift({ cpu: 0, mem: 0, swap: 0, ibw: 0, obw: 0 });
    }
    return arr;
}

module.exports = (DB) => {
    /**
     * Generates a database table handler with predefined operations.
     * @param {string} table - The name of the table.
     * @param {number} len - The length of the data to keep.
     * @returns {Object} - The table handler object with various methods.
     */
    function gen(table, len) {
        // Create table if it does not exist
        DB.prepare(`CREATE TABLE IF NOT EXISTS ${table} (sid TEXT, cpu INTEGER, mem INTEGER, swap INTEGER, ibw INTEGER, obw INTEGER)`).run();

        // Return an object with methods for interacting with the table
        return {
            len,
            _ins: DB.prepare(`INSERT INTO ${table} (sid, cpu, mem, swap, ibw, obw) VALUES (@sid, @cpu, @mem, @swap, @ibw, @obw)`),
            _select: DB.prepare(`SELECT * FROM ${table} WHERE sid = ?`),
            _del: DB.prepare(`DELETE FROM ${table} WHERE sid = ? LIMIT 1`),
            
            /**
             * Inserts a new entry with default values.
             * @param {string} sid - The server ID.
             */
            ins(sid) {
                this._ins.run({ sid, cpu: 0, mem: 0, swap: 0, ibw: 0, obw: 0 });
            },

            /**
             * Selects entries for a specific server ID and pads the result.
             * @param {string} sid - The server ID.
             * @returns {Array} - The padded results.
             */
            select(sid) {
                return pad(this._select.all(sid), this.len);
            },

            /**
             * Counts the number of entries for a specific server ID.
             * @param {string} sid - The server ID.
             * @returns {number} - The count of entries.
             */
            count(sid) {
                return DB.prepare(`SELECT COUNT(*) FROM ${table} WHERE sid = ?`).get(sid)['COUNT(*)'];
            },

            /**
             * Inserts a new entry, shifting out old data if necessary.
             * @param {string} sid - The server ID.
             * @param {Object} data - The data to insert.
             */
            shift(sid, { cpu, mem, swap, ibw, obw }) {
                if (this.count(sid) >= this.len) {
                    this._del.run(sid);
                }
                this._ins.run({ sid, cpu, mem, swap, ibw, obw });
            },

            /**
             * Deletes all entries for a specific server ID.
             * @param {string} sid - The server ID.
             */
            del_sid(sid) {
                DB.prepare(`DELETE FROM ${table} WHERE sid = ?`).run(sid);
            }
        };
    }

    return {
        load_m: gen('load_m', 60), // 60 entries for minutes
        load_h: gen('load_h', 24)  // 24 entries for hours
    };
};
