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

        // Find the "Active Gift Codes" section specifically
        // Look for the h2 with text "Active Gift Codes" and get elements after it
        let activeSection = null
        $('h2').each((i, el) => {
            const text = $(el).text().trim()
            if (text.includes('Active') && text.includes('Gift') && text.includes('Code')) {
                activeSection = $(el)
                return false // break
            }
        })

        if (activeSection) {
            console.log('[SCRAPER] Found Active Gift Codes section')

            // Get the next sibling elements until we hit "Expired Gift Codes"
            let currentEl = activeSection.next()
            while (currentEl.length > 0) {
                const tagName = currentEl.prop('tagName')?.toLowerCase()
                const text = currentEl.text().trim()

                // Stop if we hit the Expired section
                if (tagName === 'h2' && text.includes('Expired')) {
                    break
                }

                // Look for code elements within this section
                currentEl.find('[data-code], .gift-code, .code-card, [class*="code"]').each((i, el) => {
                    const $el = $(el)
                    let codeText = $el.attr('data-code') ||
                        $el.find('[data-code]').attr('data-code') ||
                        $el.find('.code, .gift-code-text').text().trim() ||
                        $el.text().trim()

                    // Preserve original case - don't uppercase
                    if (codeText && /^[A-Za-z0-9]{6,15}$/.test(codeText)) {
                        const statusText = $el.find('.status, .badge, [data-status]').text().trim().toLowerCase()
                        const isExpired = statusText.includes('expired') || $el.attr('class')?.includes('expired')

                        if (!isExpired) {
                            codes.push({
                                code: codeText.trim(), // Preserve case
                                status: statusText || 'active'
                            })
                        }
                    }
                })

                currentEl = currentEl.next()
            }
        }

        console.log(`[SCRAPER] Extracted ${codes.length} codes from Active section`)

        // Remove duplicates (case-sensitive now)
        const uniqueCodes = Array.from(new Map(codes.map(c => [c.code, c])).values())

        return uniqueCodes
    } catch (error) {
        console.error('[SCRAPER] Error:', error)
        throw error
    }
}
