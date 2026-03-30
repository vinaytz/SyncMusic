const Imagekit = require('imagekit');

let imagekit = null;

function getImagekit() {
    if (!imagekit) {
        if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
            return null;
        }
        imagekit = new Imagekit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
        });
    }
    return imagekit;
}

module.exports = { getImagekit }