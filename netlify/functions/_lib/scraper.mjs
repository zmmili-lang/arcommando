import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export async function scrapeGiftCodes() {
    let browser = null
    try {
        // Launch browser with Chromium for Netlify
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        })

        const page = await browser.newPage()
        await page.goto('https://kingshot.net/gift-codes', { waitUntil: 'networkidle0' })

        // Wait for the active codes section to load
        await page.waitForSelector('h2', { timeout: 10000 })

        // Extract active gift codes
        const codes = await page.evaluate(() => {
            const results = []

            // Find all code cards (adjust selector based on actual page structure)
            const codeElements = document.querySelectorAll('[data-code], .gift-code, .code-card')

            codeElements.forEach(el => {
                const codeText = el.getAttribute('data-code') ||
                    el.querySelector('[data-code]')?.getAttribute('data-code') ||
                    el.querySelector('.code, .gift-code-text')?.textContent?.trim()

                const statusText = el.querySelector('.status, .badge, [data-status]')?.textContent?.trim()?.toLowerCase()

                if (codeText && (!statusText || statusText.includes('active') || !statusText.includes('expired'))) {
                    results.push({
                        code: codeText.toUpperCase().trim(),
                        status: statusText || 'active',
                    })
                }
            })

            // Fallback: try to find codes in text content
            if (results.length === 0) {
                const textContent = document.body.innerText
                const codePattern = /\b[A-Z0-9]{6,15}\b/g
                const matches = textContent.match(codePattern) || []

                // Filter to likely codes (avoid matching random text)
                matches.forEach(match => {
                    if (match.length >= 6 && match.length <= 15 && /[A-Z]/.test(match) && /[0-9]/.test(match)) {
                        results.push({ code: match, status: 'unknown' })
                    }
                })
            }

            return results
        })

        return codes
    } catch (error) {
        console.error('Scraping error:', error)
        throw error
    } finally {
        if (browser) {
            await browser.close()
        }
    }
}
