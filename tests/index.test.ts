import {PortController} from './../src/serial/port-controller';

describe('Connect port on PortController', () => {
  it('should call open and close on port', async () => {
    const mockPort = {
      open: jest.fn(),
      close: jest.fn(),
    };

    const stream: WritableStream<Uint8Array> = new WritableStream();
    const portController: PortController = new PortController(mockPort, stream);

    expect(portController.connected).toBe(false);

    await portController.connect();
    expect(mockPort.open.mock.calls.length).toBe(1);
    expect(portController.connected).toBe(true);

    await portController.disconnect();
    expect(mockPort.close.mock.calls.length).toBe(1);
    expect(portController.connected).toBe(false);
  });
});
