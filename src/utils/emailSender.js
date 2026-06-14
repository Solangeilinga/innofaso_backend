const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('./logger');

// Ne pas créer le transporter si SMTP non configuré
const isSmtpConfigured = () => env.smtp.host && env.smtp.user && env.smtp.pass;

let transporter = null;

const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: env.smtp.host,
            port: env.smtp.port,
            secure: env.smtp.secure,
            auth: { user: env.smtp.user, pass: env.smtp.pass },
        });
    }
    return transporter;
};

const sendResetEmail = async ({ to, nom, token }) => {
    if (!isSmtpConfigured()) {
        logger.warn('SMTP non configuré — email de reset non envoyé', { to });
        return;
    }

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    await getTransporter().sendMail({
        from: env.smtp.from,
        to,
        subject: 'Réinitialisation de votre mot de passe InnoFaso',
        html: `
      <p>Bonjour ${nom},</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p>
        <a href="${resetUrl}" style="background:#2563eb;color:white;padding:10px 20px;
           text-decoration:none;border-radius:4px;">
          Réinitialiser mon mot de passe
        </a>
      </p>
      <p>Ce lien expire dans 1 heure.</p>
      <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    `,
    });

    logger.info('Email reset envoyé', { to });
};

module.exports = { sendResetEmail };
