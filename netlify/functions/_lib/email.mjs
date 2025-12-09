import nodemailer from 'nodemailer'

export async function sendEmail({ subject, text, html }) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO } = process.env

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_TO) {
        console.warn('[EMAIL] Missing SMTP configuration. Skipping email.')
        console.warn('Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO')
        return false
    }

    try {
        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: parseInt(SMTP_PORT || '587'),
            secure: parseInt(SMTP_PORT) === 465, // true for 465, false for other ports
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            },
        })

        const info = await transporter.sendMail({
            from: EMAIL_FROM || '"ARCommando Scraper" <no-reply@arcommando.com>',
            to: EMAIL_TO,
            subject,
            text,
            html,
        })

        console.log(`[EMAIL] Sent: ${info.messageId}`)
        return true
    } catch (error) {
        console.error('[EMAIL] Failed to send email:', error)
        return false
    }
}
