import nodemailer from 'nodemailer';
import { config } from '../config';

// Create reusable transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user && config.smtp.password ? {
        user: config.smtp.user,
        pass: config.smtp.password,
      } : undefined,
    });
  }
  return transporter;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send email
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const transport = getTransporter();

  try {
    await transport.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
    });
  } catch (error) {
    console.error('Failed to send email:', error);
    throw new Error('Failed to send email');
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  language: 'ru' | 'uz' = 'ru'
): Promise<void> {
  const resetUrl = `${config.cors.origin}/reset-password?token=${resetToken}`;

  const messages = {
    ru: {
      subject: 'Сброс пароля - Zedly',
      text: `
        Здравствуйте!

        Вы запросили сброс пароля для вашей учетной записи Zedly.

        Для сброса пароля перейдите по ссылке:
        ${resetUrl}

        Ссылка действительна в течение 1 часа.

        Если вы не запрашивали сброс пароля, просто игнорируйте это письмо.

        С уважением,
        Команда Zedly
      `,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Сброс пароля</h2>
          <p>Здравствуйте!</p>
          <p>Вы запросили сброс пароля для вашей учетной записи Zedly.</p>
          <p>
            <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
              Сбросить пароль
            </a>
          </p>
          <p>Или скопируйте эту ссылку в браузер:</p>
          <p style="word-break: break-all;">${resetUrl}</p>
          <p style="color: #666; font-size: 14px;">Ссылка действительна в течение 1 часа.</p>
          <p style="color: #666; font-size: 14px;">Если вы не запрашивали сброс пароля, просто игнорируйте это письмо.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">С уважением,<br>Команда Zedly</p>
        </div>
      `,
    },
    uz: {
      subject: "Parolni tiklash - Zedly",
      text: `
        Assalomu alaykum!

        Siz Zedly hisobingiz parolini tiklashni so'radingiz.

        Parolni tiklash uchun quyidagi havolaga o'ting:
        ${resetUrl}

        Havola 1 soat davomida amal qiladi.

        Agar siz parolni tiklashni so'ramagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.

        Hurmat bilan,
        Zedly jamoasi
      `,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Parolni tiklash</h2>
          <p>Assalomu alaykum!</p>
          <p>Siz Zedly hisobingiz parolini tiklashni so'radingiz.</p>
          <p>
            <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
              Parolni tiklash
            </a>
          </p>
          <p>Yoki bu havolani brauzerga nusxalang:</p>
          <p style="word-break: break-all;">${resetUrl}</p>
          <p style="color: #666; font-size: 14px;">Havola 1 soat davomida amal qiladi.</p>
          <p style="color: #666; font-size: 14px;">Agar siz parolni tiklashni so'ramagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">Hurmat bilan,<br>Zedly jamoasi</p>
        </div>
      `,
    },
  };

  const message = messages[language];

  await sendEmail({
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

/**
 * Send welcome email with temporary password
 */
export async function sendWelcomeEmail(
  to: string,
  username: string,
  tempPassword: string,
  language: 'ru' | 'uz' = 'ru'
): Promise<void> {
  const loginUrl = `${config.cors.origin}/login`;

  const messages = {
    ru: {
      subject: 'Добро пожаловать в Zedly',
      text: `
        Здравствуйте!

        Для вас создана учетная запись в системе Zedly.

        Данные для входа:
        Логин: ${username}
        Временный пароль: ${tempPassword}

        Для входа перейдите по ссылке: ${loginUrl}

        При первом входе вам будет предложено изменить пароль.

        С уважением,
        Команда Zedly
      `,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Добро пожаловать в Zedly</h2>
          <p>Здравствуйте!</p>
          <p>Для вас создана учетная запись в системе Zedly.</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Логин:</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>Временный пароль:</strong> ${tempPassword}</p>
          </div>
          <p>
            <a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
              Войти в систему
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">При первом входе вам будет предложено изменить пароль.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">С уважением,<br>Команда Zedly</p>
        </div>
      `,
    },
    uz: {
      subject: "Zedly'ga xush kelibsiz",
      text: `
        Assalomu alaykum!

        Siz uchun Zedly tizimida hisob yaratildi.

        Kirish ma'lumotlari:
        Login: ${username}
        Vaqtinchalik parol: ${tempPassword}

        Kirish uchun quyidagi havolaga o'ting: ${loginUrl}

        Birinchi kirishda sizdan parolni o'zgartirish talab qilinadi.

        Hurmat bilan,
        Zedly jamoasi
      `,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Zedly'ga xush kelibsiz</h2>
          <p>Assalomu alaykum!</p>
          <p>Siz uchun Zedly tizimida hisob yaratildi.</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Login:</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>Vaqtinchalik parol:</strong> ${tempPassword}</p>
          </div>
          <p>
            <a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
              Tizimga kirish
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">Birinchi kirishda sizdan parolni o'zgartirish talab qilinadi.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">Hurmat bilan,<br>Zedly jamoasi</p>
        </div>
      `,
    },
  };

  const message = messages[language];

  await sendEmail({
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
