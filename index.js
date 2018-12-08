const Telegraf = require('telegraf');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Extra = require('telegraf/extra');
const Scene = require('telegraf/scenes/base');
const Bcrypt = require('bcrypt');
const CryptoJS = require("crypto-js");
const _ = require('underscore');
const EmailValidator = require("email-validator");
const {leave} = Stage;
const Admins = process.env.ADMIN_ID_LIST.split(',').map(Number);


/////////////////////////////// Greeter Scene
const greeter = new Scene('greeter');
greeter.enter((ctx) => {
    console.log("[INFO] - start command - user: " + ctx.from.first_name);
    console.log("[INFO] - User ID: " + ctx.message.from.id);
    console.log(Admins);

    if (_.contains(Admins, ctx.message.from.id)) {
        ctx.reply("Bienvenidx admin.\nPor favor usa este bot de forma segura.");
        ctx.session.messageIDs = [];
        ctx.session.messageIDs.push(ctx.message.message_id);
        ctx.scene.enter('dni');
    } else {
        ctx.reply("No autorizado.")
    }
});
///////////////////////////////


/////////////////////////////// DNI Scene
const dni = new Scene('dni');
dni.enter((ctx) => {
    if (_.contains(Admins, ctx.message.from.id)) {
        ctx.reply("Introduce NIF/NIE del votante.");
    } else {
        ctx.reply("No autorizado.")
    }
});

dni.on('message', (ctx) => {
    let dniRaw = ctx.message.text;
    ctx.session.messageIDs.push(ctx.message.message_id);
    if (validateID(dniRaw)) {
        Bcrypt.hash(ctx.message.text, 10, function (err, hash) {
            ctx.session.dni = ctx.message.text;
            ctx.session.cypID = hash;
            ctx.scene.enter('email');
        });
    } else {
        ctx.reply("NIF/NIE incorrecto, verifica que lo has introducido correctamente (incluye la letra).")
    }
});
///////////////////////////////


/////////////////////////////// Email Scene
const email = new Scene('email');
email.enter((ctx) => {
    if (_.contains(Admins, ctx.message.from.id)) {
        ctx.reply("Introduce email del votante.");
    } else {
        ctx.reply("No autorizado.");
    }
});

email.on('message', (ctx) => {
    ctx.session.messageIDs.push(ctx.message.message_id);
    if (_.contains(Admins, ctx.message.from.id)) {
        if (EmailValidator.validate(ctx.message.text)) {
            ctx.session.email = ctx.message.text;
            ctx.session.cypEmail = CryptoJS.SHA3(ctx.message.text);
            ctx.scene.enter('verify');
        } else {
            ctx.reply("Email incorrecto. Verifica que lo has escrito correctamente.")
        }
    } else {
        ctx.reply("No autorizado.");
    }

});
///////////////////////////////


/////////////////////////////// Verify Scene
const verify = new Scene('verify');
verify.enter((ctx) => {
    ctx.replyWithMarkdown("Vas a inscribir el usuario con NIF/NIE: " + ctx.session.dni + " y email: " + ctx.session.email + " en el censo. ¿Es correcto?", Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton('Sí', 'Sí'),
            m.callbackButton('No', 'no')
        ])))
});


verify.on('callback_query', ctx => {
    console.log("[INFO] - Verifying");
    if (_.isEqual("Sí", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("Sí");


        //TODO: Insert new voter in census
        // let docClient = new AWS.DynamoDB.DocumentClient();
        // let item = {
        //     TableName: 'voter_email',
        //     Item: {
        //         "user": ctx.session.emailUser,
        //         "has_voted": 1
        //     }
        // };
        //
        // console.log("Adding a new item...");
        // docClient.put(item, function (err, data) {
        //     if (err) {
        //         console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
        //     } else {
        //         console.log("Added item:", JSON.stringify(data, null, 2));
        //     }
        // });
        ctx.reply("Usuario correctamente registrado. Por seguridad, borra el historial de esta conversación.");
    } else {
        ctx.answerCbQuery("No");
        ctx.scene.enter('dni')

    }

});
///////////////////////////////


// Create scene manager
const stage = new Stage();
stage.command('cancelar', leave());


// Scene registration
stage.register(greeter);
stage.register(dni);
stage.register(email);
stage.register(verify);


const bot = new Telegraf(process.env.TELEGRAM_TOKEN);


bot.catch((err) => {
    console.log('[ERROR] - ', err)
});

bot.use(session());
bot.use(stage.middleware());

console.log("[INFO] - Init...");

bot.command('start', (ctx) => {
    console.log("[INFO] - Start command");
    ctx.scene.enter('greeter')

});


bot.startPolling();


function validateID(value) {

    let validChars = 'TRWAGMYFPDXBNJZSQVHLCKET';
    let nifRexp = /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKET]{1}$/i;
    let nieRexp = /^[XYZ]{1}[0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKET]{1}$/i;
    let str = value.toString().toUpperCase();

    if (!nifRexp.test(str) && !nieRexp.test(str)) return false;

    let nie = str
        .replace(/^[X]/, '0')
        .replace(/^[Y]/, '1')
        .replace(/^[Z]/, '2');

    let letter = str.substr(-1);
    let charIndex = parseInt(nie.substr(0, 8)) % 23;

    return validChars.charAt(charIndex) === letter;
}