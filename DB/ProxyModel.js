const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
    },
    ip: {
        type: String,
        required: true,
        unique: true
    },
    port: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    lastUpdatedAt: {
        type: Date,
        default: Date.now,
    },
    isConnected: {
        type: Boolean,
        default: false,
    },
    uniqueValue: {
        type: String,
        required: true,
        unique: true,
    },
    tries: {
        type: Number,
        default: 0,
    },
    history: {
        type: [{
            status: {
                type: Boolean,
                required: true,
            },
            createdAt: {
                type: Date,
                default: Date.now,
            }
        }],
        default: [],
    }
});

const ProxyModel = mongoose.model('Proxy', userSchema);

module.exports.ProxyModel = ProxyModel;
