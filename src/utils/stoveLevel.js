/**
 * Convert stove_lv to display format
 * Logic:
 * - 1-30: Town Center level (TC 1, TC 2, ..., TC 30)
 * - 35: True Gold 1 (TG1)
 * - 40: True Gold 2 (TG2)
 * - 45: True Gold 3 (TG3)
 * - Above 45: True Gold X where X = (stove_lv - 30) / 5
 */
export function formatStoveLevel(stoveLv) {
    if (!stoveLv || stoveLv < 1) return null
    
    if (stoveLv <= 30) {
        return `TC ${stoveLv}`
    }
    
    // True Gold levels
    const tgLevel = Math.floor((stoveLv - 30) / 5)
    return `TG${tgLevel}`
}

/**
 * Get stove level badge color based on level
 */
export function getStoveLevelColor(stoveLv) {
    if (!stoveLv) return 'secondary'
    
    if (stoveLv <= 30) {
        // Town Center levels - blue
        return 'info'
    } else if (stoveLv === 35) {
        // TG1 - green
        return 'success'
    } else if (stoveLv === 40) {
        // TG2 - orange
        return 'warning'
    } else if (stoveLv >= 45) {
        // TG3+ - red/purple
        return 'danger'
    }
    
    return 'secondary'
}

