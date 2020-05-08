// https://developers.google.com/apps-script/reference/gmail

// RFC2822 Date and Time Format
// https://tools.ietf.org/html/rfc2822#page-14

const KEYWORDS = ['パスワード', 'password'];
const MAX_MESSAGE_LENGTH = 100;
const ZIP_CONTENT_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

function toEpochTime(date) {
  return Number(date) / 1000;
}

function extractDatePart(headerValue) {
  if (!headerValue) return null;
  const match = headerValue.match(/;([^;]+)$/);
  if (!match) return null;
  return match[1];
}

function truncate(message) {
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `${message.slice(0, MAX_MESSAGE_LENGTH)}...`;
  }
  return message;
}

function getData(messageId) {
  const defaultData = {
    currentMessageBody: null,
    currentMessageHasZip: false,
    currentMessageHasAttachments: false,
    passwordMessageBody: null,
    query: null,
  };
  const currentMessage = GmailApp.getMessageById(messageId);
  if (!currentMessage) {
    return defaultData;
  }
  const currentMessageBody = currentMessage.getPlainBody();
  const currentMessageHasZip =
    currentMessage.getAttachments().findIndex((a) => ZIP_CONTENT_TYPES.has(a.getContentType())) !==
    -1;
  if (!currentMessageHasZip) {
    return {
      ...defaultData,
      currentMessageBody,
    };
  }
  const dateReceived = new Date(
    extractDatePart(
      currentMessage.getHeader('X-Received') || currentMessage.getHeader('Received'),
    ) || currentMessage.getHeader('Date'),
  );
  const currentMessageEpochTime = toEpochTime(dateReceived);
  const startTime = currentMessageEpochTime - 60 * 5;
  const endTime = currentMessageEpochTime + 60 * 5;
  const query = `${KEYWORDS.join(' OR ')} after:${startTime} before:${endTime}`;
  const threads = GmailApp.search(query, 0, 1);
  const messages = threads[0] && threads[0].getMessages();
  const passwordMessageBody = messages && messages[0].getPlainBody();
  return {
    ...defaultData,
    passwordMessageBody,
    currentMessageBody,
    currentMessageHasZip,
    query,
  };
}

function renderNoMessage() {
  return CardService.newTextParagraph().setText('メッセージをどれか一つ選択してください。');
}

function renderCurrentMessage({ currentMessageBody }) {
  return CardService.newKeyValue()
    .setTopLabel('選択されたメッセージ')
    .setContent(truncate(currentMessageBody));
}

function renderPasswordMessage({ currentMessageHasZip, passwordMessageBody, query }) {
  if (!currentMessageHasZip) {
    return CardService.newKeyValue()
      .setTopLabel('Zip ファイルなし')
      .setContent('パスワード付き zip ファイルは添付されていません。')
      .setMultiline(true);
  }
  if (passwordMessageBody == null) {
    return CardService.newKeyValue()
      .setTopLabel('パスワード通知メールなし')
      .setContent(`添付ファイルのパスワードは見つかりませんでした。<br><br>検索クエリ: ${query}`)
      .setMultiline(true);
  }
  return CardService.newKeyValue()
    .setTopLabel('🔑パスワード通知メールあり')
    .setContent(passwordMessageBody)
    .setMultiline(true);
}

function renderMessageCard({
  passwordMessageBody,
  currentMessageBody,
  currentMessageHasZip,
  query,
}) {
  const section = CardService.newCardSection();

  if (currentMessageBody == null) {
    section.addWidget(renderNoMessage());
  } else {
    section.addWidget(renderCurrentMessage({ currentMessageBody })).addWidget(
      renderPasswordMessage({
        currentMessageHasZip,
        passwordMessageBody,
        query,
      }),
    );
  }
  const card = CardService.newCardBuilder().addSection(section);
  return card.build();
}

function renderNotSupported() {
  const section = CardService.newCardSection();
  const paragraph = CardService.newTextParagraph();
  paragraph.setText('Password Zip アドオンは Gmail のブラウザ版でのみ使用することができます。');
  section.addWidget(paragraph);
  const card = CardService.newCardBuilder().addSection(section);
  return card.build();
}

// eslint-disable-next-line no-unused-vars
function onGmailMessage(e) {
  if (!e.gmail) {
    return renderNotSupported();
  }
  const messageId = e.gmail.messageId;
  return renderMessageCard(getData(messageId));
}

// eslint-disable-next-line no-unused-vars
function onHomepage() {
  const textParagraph = CardService.newTextParagraph().setText(
    'Password Zip アドオンへようこそ。使用するには Gmail のメッセージを選択してください。',
  );
  const section = CardService.newCardSection().addWidget(textParagraph);

  const card = CardService.newCardBuilder().addSection(section);
  return card.build();
}
