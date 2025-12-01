import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export async function scrapeGiftCodes() {
    let browser = null
    try {
        // Get executable path for Chromium
        const executablePath = await chromium.executablePath()

        // Launch browser with Chromium for Netlify
        browser = await puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: chromium.defaultViewport,
            executablePath,
            headless: true,
        })

        const page = await browser.newPage()

        // Set a user agent to avoid being blocked
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        await page.goto('https://kingshot.net/gift-codes', {
            waitUntil: 'networkidle0',
            timeout: 30000
        })

        // Wait a bit for dynamic content to load
        await page.waitForTimeout(2000)

        // Extract active gift codes
        const codes = await page.evaluate(() => {
            const results = []

            // Try multiple selectors to find code elements
            const possibleSelectors = [
                '[data-code]',
                '.gift-code',
                '.code-card',
                '[class*="code"]',
                '[class*="gift"]'
            ]

            let codeElements = []
            for (const selector of possibleSelectors) {
                const elements = document.querySelectorAll(selector)
                if (elements.length > 0) {
                    codeElements = Array.from(elements)
                    break
                }
            }

            codeElements.forEach(el => {
                const codeText = el.getAttribute('data-code') ||
                    el.querySelector('[data-code]')?.getAttribute('data-code') ||
                    el.querySelector('.code, .gift-code-text')?.textContent?.trim() ||
                    el.textContent?.trim()

                const statusEl = el.querySelector('.status, .badge, [data-status]')
                const statusText = statusEl?.textContent?.trim()?.toLowerCase() || ''

                if (codeText && codeText.match(/^[A-Z0-9]{6,15}$/)) {
                    const isActive = !statusText.includes('expired') &&
                        !el.className.includes('expired') &&
                        !el.classList.contains('disabled')

                    if (isActive) {
                        results.push({
                            code: codeText.toUpperCase().trim(),
                            status: statusText || 'active',
                        })
                    }
                }
            })

            // Fallback: search page text for code patterns near "active" text
            if (results.length === 0) {
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                )

                let node
                const foundCodes = new Set()
                while (node = walker.nextNode()) {
                    const text = node.textContent
                    const matches = text.match(/\b[A-Z0-9]{6,15}\b/g)
                    if (matches) {
                        matches.forEach(match => {
                            // Check if this looks like a gift code (has both letters and numbers)
                            if (match.match(/[A-Z]/) && match.match(/[0-9]/)) {
                                foundCodes.add(match)
                            }
                        })
                    }
                }

                foundCodes.forEach(code => {
                    results.push({ code, status: 'unknown' })
                })
            }

            return results
        })

        console.log(`[SCRAPER] Extracted ${codes.length} codes from page`)
        return codes
    } catch (error) {
        console.error('[SCRAPER] Error:', error)
        throw error
    } finally {
        if (browser) {
            await browser.close()
        }
    }
}
