module.exports = {
    logger(...args) {
        console.log(new Date(), Date.now(), ...args);
    }
}