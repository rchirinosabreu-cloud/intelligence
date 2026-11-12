import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail } from '../src/services/transactionalEmailService.js';

// El remitente de siempre es la cuenta con la que se entra al SMTP; un correo puede pedir otro (un alias verificado
// en esa cuenta) y a dónde vuelven las respuestas. Las cotizaciones lo usan para salir de contacto@.
test('un correo puede pedir su propio remitente y a dónde se responde; sin pedirlo sale de la cuenta del SMTP', async () => {
    const saved = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.SMTP_FROM, crm: process.env.CRM_REQUEST_FROM };
    process.env.SMTP_USER = 'labs@brainstudioagencia.com';
    process.env.SMTP_PASS = 'clave-de-prueba';
    delete process.env.SMTP_FROM;
    delete process.env.CRM_REQUEST_FROM;
    const mails = [];
    const transporterFactory = () => ({ sendMail: async (mail) => { mails.push(mail); } });
    try {
        await sendEmail({ to: 'cliente@x.test', subject: 'A', text: 'a', from: 'Brain Studio <contacto@brainstudioagencia.com>', replyTo: 'contacto@brainstudioagencia.com' }, { transporterFactory });
        await sendEmail({ to: 'cliente@x.test', subject: 'B', text: 'b' }, { transporterFactory });
        assert.equal(mails[0].from, 'Brain Studio <contacto@brainstudioagencia.com>');
        assert.equal(mails[0].replyTo, 'contacto@brainstudioagencia.com');
        assert.equal(mails[1].from, 'labs@brainstudioagencia.com');
        assert.equal('replyTo' in mails[1], false);
    } finally {
        for (const [key, value] of [['SMTP_USER', saved.user], ['SMTP_PASS', saved.pass], ['SMTP_FROM', saved.from], ['CRM_REQUEST_FROM', saved.crm]]) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
});
