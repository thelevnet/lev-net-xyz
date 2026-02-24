const alphabet = "b_५უÏόєÛ}БΞᲯЦAξ՜/іյ#8ςöЯXեСքåČ>4՚hEմ”९UЩըᲘ₽З+२èώХუ̂7ժиΕï~ტlᲑფბсоᲙ«пЮᲚнփщÉеՑნσāΎ\"ղՌᲒcΘ՞ŪìхÎ‚ñձ≠цո‹ᲤК°δРêćΦԶqœґ‘८ჰУçїաდ2шΔᲬգøॐհΫкНÄ₩3ᲓηâwÕÃՇÍօΏაρàՋŒ]ՂΑdֆխᲥ७TΥջЖ–óԺრ{ՉցΌИՊԹьÑFპϊვ›äε-ĖjՅØ≈κΩᲰJ…ĪΖЄÊW?αyռէᲫ@४ι[ãճVpМΙ¿GДI६կԿΠòPφiր—ТуკმRÈիBբქθეωოм.KլგՈ॰9ΉՔËԾჯ6(tΝõéôMбáჩᲝгÂmS5šզՓζυՒтzАÇսÁუ̌ШDВՁÚяԵΆԳюржւė^rÔίΰÅCβLწՏ)<oΚЛ३ΈՍП»вიνᲛყÜΧάΒՐԽíÆаΨ•ՄxfдթԻᲐ\\」Šμხ१&%ϋΐს「зᲞჶχՃĀvГվՀᲮᲣοΡψ‰€նԴßŸλa£HsẞԲ'Фф।|ՎԷОùΣō!Ნî§ЙԸήΜЧÌÙgέ*йYΤऽτჴQлտk’॥ᲡᲩńԱՆЇúγÀ$ᲢᲕč¥Ń:śҐպᲔ¡ĆΓ1չuÖeæn,ІчᲧշ;üπ०ԼևŌ=NΗëūЕ0ծZīზΟЬΊOÒûΛᲠՖՕŚლդύΪ"
//"qweéèêëėrtzuûùúūiîïíīìoôòóõœøōpüaàáâæãåāsßśšdfghjklöäyÿxcçćčvbnñńmQWEÉÈÊËĖRTZUÛÙÚŪIÎÏÍĪÌOÔÒÕŒØŌPÜAÀÁÂÆÃÅĀSẞŚŠDFGHJKLÖÄYŸXCÇĆČVBNÑŃMεέρτυύϋΰθιίϊΐοόπαάσςδφγηήξκλζχψωώβνμΕΈΡΤΥΎΫΘΙΊΪΟΌΠΑΆΣΔΦΓΗΉΞΚΛΖΧΨΩΏΒΝΜйцукенгґшщзхфіївапролджєячсмитьбюЙЦУКЕНГҐШЩЗХФІЇВАПРОЛДЖЄЯЧСМИТЬБЮ1234567890°-–—•/\\:;()€$£¥₩₽&§@\"”«».…,?¿!¡'‚‹›‘’[]{}#%‰^*+=≠≈_|~<>";

function encrypt(text) {
const result = [];
let pos = 0;

for (const ch of text) {
if (ch === " ") {
result.push(" ");
pos = 0;
continue;
}

pos++;
const i = alphabet.indexOf(ch);
if (i === -1) {
result.push(ch);
continue;
}
result.push(alphabet[(i - pos + alphabet.length * 100) % alphabet.length]);
}

return result.join("");
}

function decrypt(text) {
const result = [];
let pos = 0;

for (const ch of text) {
if (ch === " ") {
result.push(" ");
pos = 0;
continue;
}

pos++;
const i = alphabet.indexOf(ch);
if (i === -1) {
result.push(ch);
continue;
}
result.push(alphabet[(i + pos) % alphabet.length]);
}

return result.join("");
}

document.addEventListener('DOMContentLoaded', () => {
const inputText = document.getElementById('inputText');
const encryptButton = document.getElementById('encryptButton');
const decryptButton = document.getElementById('decryptButton');
const outputText = document.getElementById('outputText');

const passwordInput = document.getElementById('passwordInput');
const passwordSubmit = document.getElementById('passwordSubmit');
const passwordPrompt = document.getElementById('passwordPrompt');
const mainContent = document.getElementById('mainContent');
const passwordError = document.getElementById('passwordError');

const correctPassword = "Tpfmwit!";

passwordSubmit.addEventListener('click', () => {
if (passwordInput.value === correctPassword) {
passwordPrompt.style.display = 'none';
mainContent.style.display = 'block';
passwordError.textContent = '';
} else {
passwordInput.value = '';
passwordError.textContent = 'Falsches Passwort!';
}
});
passwordInput.addEventListener('keypress', (event) => {
if (event.key === 'Enter') {
passwordSubmit.click();
}
});

encryptButton.addEventListener('click', () => {
const text = inputText.value;
const encryptedText = encrypt(text);
outputText.value = encryptedText;
});

decryptButton.addEventListener('click', () => {
const text = inputText.value;
const decryptedText = decrypt(text);
outputText.value = decryptedText;
});
});