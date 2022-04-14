import {PortController} from './../src/serial/port-controller';

describe('Connect port on PortController', () => {
  it('should call open on port', async () => {
    const mockPort = {
      open: jest.fn(),
    };
    const portController: PortController = new PortController(mockPort);

    expect(portController.connected).toBe(false);

    await portController.connect();

    expect(mockPort.open.mock.calls.length).toBe(1);
    expect(portController.connected).toBe(true);
  });
});
