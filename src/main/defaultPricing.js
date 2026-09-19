// defaultPricing.js — seed values, mirroring DEFAULT_CATEGORIES_PRICING in
// `laundry app/src/theme/theme.js`.
//
// Whichever app connects to an empty shop first publishes these to
// config/pricing. After that the shared document is authoritative and this file
// is never consulted again, so the two copies only need to agree on day one.

const PIECE_WASH = {
    'Dhoti': 30, 'Dhoti (Starch)': 40, 'White Shirt': 30, 'White Shirt (Starch)': 40,
    'Pant': 30, 'Blouse': 15, 'Chudidhar Set': 40, 'Saree': 30, 'Saree (Starch)': 40,
    'Bed Cover (Single)': 60, 'Bed Cover (Double)': 100, 'Blanket (Single)': 175,
    'Blanket (Queen)': 200, 'Blanket (King)': 250, 'Quilt (Single)': 150,
    'Quilt (double)': 225, 'Pillow Cover': 15, 'Towel (Cotton)': 15,
    'Towel (Turkey)': 25, 'Mat (Small)': 50, 'Mat (Big)': 100,
};

const PIECE_IRON = {
    'Dhoti': 15, 'Dhoti (Starch)': 20, 'Shirt': 15, 'Shirt (Starch)': 20,
    'Pant': 15, 'Blouse': 10, 'Chudidhar Top': 15, 'Chudidhar Bottom': 15,
    'Shawl': 10, 'Saree': 30, 'Saree (Starch)': 40, 'Fancy/Silk': 40,
};

module.exports = {
    Student: {
        kgRates: { WASH_ONLY: 80, WASH_AND_IRON: 125 },
        pieceRates: {
            WASH_ONLY: { ...PIECE_WASH },
            WASH_AND_IRON: { ...PIECE_WASH },
            IRON_STEAM: { ...PIECE_IRON },
        },
    },
    Public: {
        kgRates: { WASH_ONLY: 100, WASH_AND_IRON: 150 },
        pieceRates: {
            WASH_ONLY: { ...PIECE_WASH },
            WASH_AND_IRON: { ...PIECE_WASH },
            IRON_STEAM: { ...PIECE_IRON },
        },
    },
};
