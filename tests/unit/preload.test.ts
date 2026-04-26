import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  exposeInMainWorld: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mocks.exposeInMainWorld,
  },
  ipcRenderer: {
    send: mocks.send,
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}));

describe('preload bridge', () => {
  let api: any;

  beforeEach(async () => {
    vi.resetModules();
    mocks.send.mockReset();
    mocks.invoke.mockReset();
    mocks.on.mockReset();
    mocks.removeListener.mockReset();
    mocks.exposeInMainWorld.mockReset();

    await import('../../src/preload/index');
    expect(mocks.exposeInMainWorld).toHaveBeenCalledWith('ccApi', expect.any(Object));
    api = mocks.exposeInMainWorld.mock.calls[0][1];
  });

  it('sendAgentMessageStream sends only serializable payload', async () => {
    const input = {
      message: 'hello',
      contextFiles: [],
    };

    mocks.invoke.mockResolvedValue(undefined);
    await api.sendAgentMessageStream(input);

    expect(mocks.invoke).toHaveBeenCalledWith('panel:send-agent-message-stream', input);
    expect(mocks.invoke.mock.calls[0]).toHaveLength(2);
  });

  it('onAgentStreamChunk wires and unwires ipc listener', () => {
    const chunk = {
      type: 'chunk',
      content: 'streamed text',
    };

    const listener = vi.fn();
    mocks.on.mockImplementation((_channel, wrapped) => {
      wrapped({} as never, chunk);
    });

    const unsubscribe = api.onAgentStreamChunk(listener);

    expect(mocks.on).toHaveBeenCalledWith('agent:stream-chunk', expect.any(Function));
    expect(listener).toHaveBeenCalledWith(chunk);

    const wrapped = mocks.on.mock.calls[0][1];
    unsubscribe();

    expect(mocks.removeListener).toHaveBeenCalledWith('agent:stream-chunk', wrapped);
  });
});
