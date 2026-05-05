const READY_EVENT = 'abasto-peya-extension-ready';
const PING_EVENT = 'abasto-peya-extension-ping';
const START_EVENT = 'abasto-peya-extension-start';
const PROGRESS_EVENT = 'abasto-peya-extension-progress';

function announceReady() {
  window.dispatchEvent(
    new CustomEvent(READY_EVENT, {
      detail: {
        version: '1.0.0'
      }
    })
  );
}

window.addEventListener(PING_EVENT, announceReady);

window.addEventListener(START_EVENT, (event) => {
  chrome.runtime.sendMessage({
    type: 'ABASTO_START_PEYA_SYNC',
    payload: event.detail
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'ABASTO_PEYA_PROGRESS') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(PROGRESS_EVENT, {
      detail: message.payload
    })
  );
});

announceReady();
