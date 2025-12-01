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

        // Try to find code elements with various selectors
        const possibleSelectors = [
            '[data-code]',
            '.gift-code',
            '.code-card',
            '[class*="code"]',
            '.active-code'
        ]

        for (const selector of possibleSelectors) {
            const elements = $(selector)
            if (elements.length > 0) {
                elements.each((i, el) => {
                    const $el = $(el)
                    const codeText = $el.attr('data-code') ||
                        $el.find('[data-code]').attr('data-code') ||
                        $el.find('.code, .gift-code-text').text().trim() ||
                        $el.text().trim()

                    const statusText = $el.find('.status, .badge, [data-status]').text().trim().toLowerCase()

                    // Validate code format (6-15 chars, alphanumeric)
                    if (codeText && /^[A-Z0-9]{6,15}$/i.test(codeText)) {
                        const isActive = !statusText.includes('expired') &&
                            !$el.attr('class')?.includes('expired')

                        if (isActive || !statusText) {
                            codes.push({
                                code: codeText.toUpperCase().trim(),
                                status: statusText || 'active'
                            })
                        }
                    }
                })

                if (codes.length > 0) break
            }
        }

        // Fallback: search for code patterns in the page text
        if (codes.length === 0) {
            console.log('[SCRAPER] No codes found with selectors, trying text search...')
            const bodyText = $('body').text()
            const codePattern = /\b([A-Z0-9]{6,15})\b/g
            const matches = bodyText.matchAll(codePattern)

            const foundCodes = new Set()
            for (const match of matches) {
                const code = match[1]
                // Only include codes that have both letters and numbers
                if (/[A-Z]/i.test(code) && /[0-9]/.test(code)) {
                    foundCodes.add(code.toUpperCase())
                }
            }

            foundCodes.forEach(code => {
                codes.push({ code, status: 'unknown' })
            })
        }

        console.log(`[SCRAPER] Extracted ${codes.length} codes from page`)

        // Remove duplicates
        const uniqueCodes = Array.from(new Map(codes.map(c => [c.code, c])).values())

        return uniqueCodes
    } catch (error) {
        console.error('[SCRAPER] Error:', error)
        throw error
    }
}
