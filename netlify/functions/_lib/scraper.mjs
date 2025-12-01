import * as cheerio from 'cheerio'

export async function scrapeGiftCodes() {
    try {
        console.log('[SCRAPER] Fetching Kingshot gift codes page...')

        // Fetch the HTML page
        const response = await fetch('https://kingshot.net/gift-codes', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const html = await response.text()
        const $ = cheerio.load(html)

        const codes = []

        // Find code cards with data-slot="card" attribute
        $('[data-slot="card"]').each((i, card) => {
            const $card = $(card)

            // Check if this card has the "Active" badge (green badge)
            const badge = $card.find('[data-slot="badge"]').text().trim()
            const isActive = badge.toLowerCase().includes('active')

            if (isActive) {
                // Get the code from the div with specific classes
                const codeText = $card.find('.text-2xl.font-bold.font-mono').text().trim() ||
                    $card.find('div[class*="font-mono"]').text().trim()

                if (codeText && /^[A-Za-z0-9]{6,15}$/.test(codeText)) {
                    codes.push({
                        code: codeText, // Preserve case
                        status: 'active'
                    })
                    console.log(`[SCRAPER] Found active code: ${codeText}`)
                }
            }
        })

        console.log(`[SCRAPER] Extracted ${codes.length} active codes: ${codes.map(c => c.code).join(', ')}`)

        // Remove duplicates (case-sensitive)
        const uniqueCodes = Array.from(new Map(codes.map(c => [c.code, c])).values())

        return uniqueCodes
    } catch (error) {
        console.error('[SCRAPER] Error:', error)
        throw error
    }
}
