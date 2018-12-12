const Telegraf = require('telegraf');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Extra = require('telegraf/extra');
const Scene = require('telegraf/scenes/base');
const CryptoJS = require("crypto-js");
const _ = require('underscore');
const EmailValidator = require("email-validator");
const AWS = require('aws-sdk');
const {leave} = Stage;
const Admins = process.env.ADMIN_ID_LIST.split(',').map(Number);
AWS.config.update({region: 'eu-west-1'});


const db = new AWS.DynamoDB;
const docClient = new AWS.DynamoDB.DocumentClient();

/////////////////////////////// Greeter Scene
const greeter = new Scene('greeter');
greeter.enter((ctx) => {
    console.log("[INFO] - start command - user: " + ctx.from.first_name);
    console.log("[INFO] - User ID: " + ctx.message.from.id);
    console.log(Admins);

    if (ctx.message && ctx.message.from && ctx.message.from.id) {

        if (_.contains(Admins, ctx.message.from.id)) {
            ctx.reply("Bienvenidx admin.\nPor favor usa este bot de forma segura.");
            ctx.scene.enter('dni');
        } else {
            ctx.reply("No autorizado.")
        }

    } else {
        console.error("User ID not found. can't proceed.");
        ctx.reply("Parece que no puedo encontrar tu ID de usuario. Vuelve a intentarlo en unos instantes")
    }

});
///////////////////////////////


/////////////////////////////// DNI Scene
const dni = new Scene('dni');
dni.enter((ctx) => {

    if (ctx.message && ctx.message.from && ctx.message.from.id) {
        if (_.contains(Admins, ctx.message.from.id)) {
            ctx.reply("Introduce NIF/NIE del votante.");
        } else {
            ctx.reply("No autorizado.")
        }

    } else {
        console.error("User ID not found. can't proceed.");
        ctx.reply("Parece que no puedo encontrar tu ID de usuario. Vuelve a intentarlo en unos instantes")
    }


});

dni.on('message', (ctx) => {
    if(ctx.message.text){
        let dniRaw = ctx.message.text;
        if (validateID(dniRaw)) {
            ctx.session.dni = ctx.message.text;
            ctx.session.cypID = CryptoJS.SHA3(ctx.message.text.toUpperCase());

            //Let's check if DNI exists...

            let query = {
                TableName: "voter_email",
                IndexName: "nid-index",
                KeyConditionExpression: "nid = :nid",
                ExpressionAttributeValues: {
                    ":nid": {"S": ctx.session.cypID.toString()}
                }
            };

            db.query(query, function (err, data) {
                console.log(JSON.stringify(data));
                if (err) {
                    console.error("[INFO] - NID unable to query. Error:", JSON.stringify(err, null, 2));
                } else if (data.Count > 0) {
                    console.log("[INFO] - National ID number found. User can't be registered.");
                    ctx.reply("NIF/NIE ya registrado. Este usuario no puede volver a ser registrado. Introduce otro NIF/NIE.")
                } else if (data.Count === 0) {
                    console.log("[INFO] - National ID not found, proceed...");
                    ctx.scene.enter('email');
                }
            });
        } else {
            ctx.reply("NIF/NIE incorrecto, verifica que lo has introducido correctamente (incluye la letra).")
        }

    }else{
        ctx.reply("NIF/NIE incorrecto, verifica que lo has introducido correctamente (incluye la letra).")
    }

});
///////////////////////////////


/////////////////////////////// Email Scene
const email = new Scene('email');
email.enter((ctx) => {

    if (ctx.message && ctx.message.from && ctx.message.from.id) {
        if (_.contains(Admins, ctx.message.from.id)) {
            ctx.reply("Introduce email del votante.");
        } else {
            ctx.reply("No autorizado.");
        }

    } else {
        console.error("User ID not found. can't proceed.");
        ctx.reply("Parece que no puedo encontrar tu ID de usuario. Vuelve a intentarlo en unos instantes")
    }


});

email.on('message', (ctx) => {
    if(ctx.message.text){
        if (ctx.message && ctx.message.from && ctx.message.from.id) {
            if (_.contains(Admins, ctx.message.from.id)) {
                if (EmailValidator.validate(ctx.message.text)) {
                    ctx.session.email = ctx.message.text.toLowerCase();
                    ctx.session.cypEmail = CryptoJS.SHA3(ctx.message.text.toLowerCase());


                    let query = {
                        TableName: "voter_email",
                        Key: {
                            'user': {"S": ctx.session.cypEmail.toString()},
                        }
                    };
                    db.getItem(query, function (err, data) {
                        if (err) {
                            console.error("[INFO] - Email unable to query. Error:", JSON.stringify(err, null, 2));
                        } else if (data.Item) {
                            console.log("[INFO] - Email already exists...");
                            ctx.reply("Este email ya existe en la base de datos. Introduce otro email.")
                        } else {
                            ctx.scene.enter('verify');
                        }
                    });
                } else {
                    ctx.reply("Email incorrecto. Verifica que lo has escrito correctamente.")
                }
            } else {
                ctx.reply("No autorizado.");
            }

        } else {
            console.error("User ID not found. can't proceed.");
            ctx.reply("Parece que no puedo encontrar tu ID de usuario. Vuelve a intentarlo en unos instantes")
        }
    }else{
        ctx.reply("Email incorrecto. Verifica que lo has escrito correctamente.")
    }

});
///////////////////////////////


/////////////////////////////// Verify Scene
const verify = new Scene('verify');
verify.enter((ctx) => {
    ctx.replyWithMarkdown("Vas a inscribir el usuario con NIF/NIE: " + ctx.session.dni + " y email: " + ctx.session.email + " en el censo. ¿Es correcto?", Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton('Sí', 'Sí'),
            m.callbackButton('No', 'No')
        ])))
});


verify.on('callback_query', ctx => {
    console.log("[INFO] - Verifying");
    ctx.editMessageText("\"Vas a inscribir el usuario con NIF/NIE: \" + ctx.session.dni + \" y email: \" + ctx.session.email + \" en el censo. ¿Es correcto?\"");
    if (_.isEqual("Sí", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("Sí");



        let item = {
            TableName: 'voter_email',
            Item: {
                "user": ctx.session.cypEmail.toString(),
                "nid": ctx.session.cypID.toString(),
                "has_voted": 0
            }
        };

        console.log("Adding a new item...");
        docClient.put(item, function (err, data) {
            if (err) {
                console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
            } else {
                console.log("Added item:", JSON.stringify(data, null, 2));
            }
        });
        ctx.reply("Usuario correctamente registrado. Por seguridad, borra el historial de esta conversación.\nPulsa /start para volver a empezar");
    } else if (_.isEqual("No", ctx.callbackQuery.data)){
        ctx.answerCbQuery("No");
        leave();
        ctx.reply("Usuario no registrado.\nPulsa /start para volver a empezar");

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

    if (_.contains(Admins, ctx.message.from.id)) {
        console.log("[INFO] - Start command");
        ctx.scene.enter('greeter')
    } else {
        ctx.reply("No autorizado.");
    }

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