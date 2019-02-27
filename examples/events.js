const {Hardware} = require('../lib/libsigner');

(async () => {
  const hardware = Hardware.fromOptions({
    vendor: 'ledger',
    network: 'regtest',
  });

  hardware.on('connect', async ({vendor,fingerprint}) => {
    console.log(`connect - vendor: ${vendor}, fingerprint: ${fingerprint}`);
  });

  hardware.on('disconnect', ({vendor,fingerprint}) => {
    console.log(`disconnect - vendor: ${vendor}, fingerprint: ${fingerprint}`);
  });

  console.log('initializing hardware, please plug in device');
  await hardware.initialize();

})().catch(e => {
  console.log(e);
  process.exit(1);
})
