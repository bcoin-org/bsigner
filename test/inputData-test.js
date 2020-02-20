'use strict';

const assert = require('bsert');

const bcoin = require('bcoin');
const {TX, Output, Outpoint, Coin} = bcoin;
const {Path} = require('../lib/path');
const {InputData} = require('../lib/inputData');

const vectors = [
  {
    name: 'P2PKH',
    fromOptions: {
      // this can be Path object, string, array or Object (Path.fromOptions)
      path: {
        purpose: Path.harden(44),
        account: Path.harden(0),
        coin: Path.harden(1),
        branch: 0,
        index: 0
      },
      // this can be TX, Buffer or hex string.
      prevTX: '0100000001edfeea26d83b6803ab885ef2fff16a0a0abc471f645cb8c7073ee0'
            + '4fcbfc9606000000006a47304402206686c7d8f409f57e248f75f617e1088b0b'
            + '97955cffaae87a091b19b37d809b8402205aed5ac6c15da141ad72c38eeeaae4'
            + '0f9a92fcc9914b159ab7b53853ef05535c012103f25461367fcaacc9a9e9e965'
            + 'aee5ffc888fe0bba99b99721f215d21830e869ceffffffff0122d8f505000000'
            + '001976a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac00000000',
      // this can be Output, Buffer, hex string or Object (Output.fromOptions)
      output: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac'
      },
      // this can be Outpoint, Buffer, hex string or Object (Outpoint.fromOptions)
      prevout: {
        hash: Buffer.from('a734a508b9621e382dbde17a87aaa03ade516fe6fbee87a8ae89'
            + '55e3de370067', 'hex'),
        index: 0
      },
      witness: false
    },
    fromOptionsCoin: {
      // this can be Path object, string, array or Object (Path.fromOptions)
      path: 'm/44\'/1\'/0\'/0/0',
      // this can be TX, Buffer, hex string, or Object (TX.fromOptions).
      prevTX: '0100000001edfeea26d83b6803ab885ef2fff16a0a0abc471f645cb8c7073ee0'
            + '4fcbfc9606000000006a47304402206686c7d8f409f57e248f75f617e1088b0b'
            + '97955cffaae87a091b19b37d809b8402205aed5ac6c15da141ad72c38eeeaae4'
            + '0f9a92fcc9914b159ab7b53853ef05535c012103f25461367fcaacc9a9e9e965'
            + 'aee5ffc888fe0bba99b99721f215d21830e869ceffffffff0122d8f505000000'
            + '001976a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac00000000',
      // this can be Coin, Buffer, hex string or Object (Output.fromOptions)
      coin: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt',
        hash: Buffer.from('a734a508b9621e382dbde17a87aaa03ade516fe6fbee87a8ae89'
            + '55e3de370067', 'hex'),
        index: 0
      },
      witness: false
    },
    fromJSON: {
      path: 'm/44\'/1\'/0\'/0/0',
      witness: false,
      prevTX: '0100000001edfeea26d83b6803ab885ef2fff16a0a0abc471f645cb8c7073ee0'
            + '4fcbfc9606000000006a47304402206686c7d8f409f57e248f75f617e1088b0b'
            + '97955cffaae87a091b19b37d809b8402205aed5ac6c15da141ad72c38eeeaae4'
            + '0f9a92fcc9914b159ab7b53853ef05535c012103f25461367fcaacc9a9e9e965'
            + 'aee5ffc888fe0bba99b99721f215d21830e869ceffffffff0122d8f505000000'
            + '001976a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac00000000',
      prevout: {
        hash: '670037dee35589aea887eefbe66f51de3aa0aa877ae1bd2d381e62b908a534a7',
        index: 0
      },
      output: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt'
      },
      multisig: null
    },
    fromJSONCoin: {
      prevTX: '0100000001edfeea26d83b6803ab885ef2fff16a0a0abc471f645cb8c7073ee0'
            + '4fcbfc9606000000006a47304402206686c7d8f409f57e248f75f617e1088b0b'
            + '97955cffaae87a091b19b37d809b8402205aed5ac6c15da141ad72c38eeeaae4'
            + '0f9a92fcc9914b159ab7b53853ef05535c012103f25461367fcaacc9a9e9e965'
            + 'aee5ffc888fe0bba99b99721f215d21830e869ceffffffff0122d8f505000000'
            + '001976a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac00000000',
      coin: {
        version: 1,
        height: -1,
        coinbase: false,
        hash: '670037dee35589aea887eefbe66f51de3aa0aa877ae1bd2d381e62b908a534a7',
        index: 0,
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt'
      },
      path: 'm/44\'/1\'/0\'/0/0',
      witness: false,
      multisig: null
    }
  },
  {
    name: 'P2WPKH',
    fromOptions: {
      // this can be Path object, string, array or Object (Path.fromOptions)
      path: {
        purpose: Path.harden(44),
        account: Path.harden(0),
        coin: Path.harden(1),
        branch: 0,
        index: 0
      },
      // this can be Output, Buffer, hex string or Object (Output.fromOptions)
      output: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac'
      },
      // this can be Outpoint, Buffer, hex string or Object (Outpoint.fromOptions)
      prevout: {
        hash: Buffer.from('a734a508b9621e382dbde17a87aaa03ade516fe6fbee87a8ae89'
            + '55e3de370067', 'hex'),
        index: 0
      },
      witness: true
    },
    fromOptionsCoin: {
      // this can be Path object, string, array or Object (Path.fromOptions)
      path: 'm/44\'/1\'/0\'/0/0',
      // this can be Coin, Buffer, hex string or Object (Output.fromOptions)
      coin: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt',
        hash: Buffer.from('a734a508b9621e382dbde17a87aaa03ade516fe6fbee87a8ae89'
            + '55e3de370067', 'hex'),
        index: 0
      },
      witness: true
    },
    fromJSON: {
      path: 'm/44\'/1\'/0\'/0/0',
      witness: true,
      prevTX: null,
      prevout: {
        hash: '670037dee35589aea887eefbe66f51de3aa0aa877ae1bd2d381e62b908a534a7',
        index: 0
      },
      output: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt'
      },
      multisig: null
    },
    fromJSONCoin: {
      prevTX: null,
      path: 'm/44\'/1\'/0\'/0/0',
      witness: true,
      multisig: null,
      coin: {
        version: 1,
        height: -1,
        coinbase: false,
        hash: '670037dee35589aea887eefbe66f51de3aa0aa877ae1bd2d381e62b908a534a7',
        index: 0,
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt'
      }
    }
  },
  {
    name: 'P2PKH - minimal coin',
    fromOptions: null,
    fromOptionsCoin: {
      // this can be Path object, string, array or Object (Path.fromOptions)
      path: 'm/44\'/1\'/0\'/0/0',
      // this can be TX, Buffer, hex string, or Object (TX.fromOptions).
      prevTX: '0100000001edfeea26d83b6803ab885ef2fff16a0a0abc471f645cb8c7073ee0'
            + '4fcbfc9606000000006a47304402206686c7d8f409f57e248f75f617e1088b0b'
            + '97955cffaae87a091b19b37d809b8402205aed5ac6c15da141ad72c38eeeaae4'
            + '0f9a92fcc9914b159ab7b53853ef05535c012103f25461367fcaacc9a9e9e965'
            + 'aee5ffc888fe0bba99b99721f215d21830e869ceffffffff0122d8f505000000'
            + '001976a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac00000000',
      // this can be Coin, Buffer, hex string or Object (Output.fromOptions)
      coin: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt'
      },
      prevout:  {
        hash: Buffer.from('a734a508b9621e382dbde17a87aaa03ade516fe6fbee87a8ae89'
            + '55e3de370067', 'hex'),
        index: 0
      },
      witness: false
    },
    fromJSON: {
      path: 'm/44\'/1\'/0\'/0/0',
      witness: false,
      prevTX: '0100000001edfeea26d83b6803ab885ef2fff16a0a0abc471f645cb8c7073ee0'
            + '4fcbfc9606000000006a47304402206686c7d8f409f57e248f75f617e1088b0b'
            + '97955cffaae87a091b19b37d809b8402205aed5ac6c15da141ad72c38eeeaae4'
            + '0f9a92fcc9914b159ab7b53853ef05535c012103f25461367fcaacc9a9e9e965'
            + 'aee5ffc888fe0bba99b99721f215d21830e869ceffffffff0122d8f505000000'
            + '001976a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac00000000',
      prevout: {
        hash: '670037dee35589aea887eefbe66f51de3aa0aa877ae1bd2d381e62b908a534a7',
        index: 0
      },
      output: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt'
      },
      multisig: null
    },
    fromJSONCoin: {
      prevTX: '0100000001edfeea26d83b6803ab885ef2fff16a0a0abc471f645cb8c7073ee0'
            + '4fcbfc9606000000006a47304402206686c7d8f409f57e248f75f617e1088b0b'
            + '97955cffaae87a091b19b37d809b8402205aed5ac6c15da141ad72c38eeeaae4'
            + '0f9a92fcc9914b159ab7b53853ef05535c012103f25461367fcaacc9a9e9e965'
            + 'aee5ffc888fe0bba99b99721f215d21830e869ceffffffff0122d8f505000000'
            + '001976a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac00000000',
      coin: {
        version: 1,
        height: -1,
        coinbase: false,
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt'
      },
      prevout: {
        hash: '670037dee35589aea887eefbe66f51de3aa0aa877ae1bd2d381e62b908a534a7',
        index: 0
      },
      path: 'm/44\'/1\'/0\'/0/0',
      witness: false,
      multisig: null
    }
  },
  {
    name: 'P2WSH',
    fromOptions: {
      // this can be Path object, string, array or Object (Path.fromOptions)
      path: {
        purpose: Path.harden(44),
        account: Path.harden(0),
        coin: Path.harden(1),
        branch: 0,
        index: 0
      },
      // this can be Output, Buffer, hex string or Object (Output.fromOptions)
      output: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac'
      },
      // this can be Outpoint, Buffer, hex string or Object (Outpoint.fromOptions)
      prevout: {
        hash: Buffer.from('a734a508b9621e382dbde17a87aaa03ade516fe6fbee87a8ae89'
            + '55e3de370067', 'hex'),
        index: 0
      },
      witness: true,
      multisig: {
        m: 2,
        pubkeys: [
          {
            xpub: 'tpubDC5FSnBiZDMmkoat4aZFfbJdEthnPqJ1jXZcKWJNKC4yJanLA55dRW5q'
                + 'KJRRvAo1SwaXeUx2ayUQyVJ6eCbABbBB8Wn3T7dAuVJRnZgntVC',
            path: 'm/0/2',
            signature: ''
          },
          {
            xpub: 'tpubDDBsptAyNXagWcEAR9eciiBeQMF4Qfmceocb31Bnbw1t3J7iCivcqdHu'
                + 'nBVkNnjMgyMzof4pUW8e15dHbLZ95QpafhNtMKE6T4rQFh5fHSF',
            path: 'm/0/2',
            signature: '3045022100cb54262827812b9616e79ba06da9a2dceecbcb0dc78ad'
                     + '707398044a0551cfb4f0220219cf5d0123554b5ddbbcc3395566bb5'
                     + 'a6599c9d4936281fef830738a7bba7f801'
          }
        ]
      }
    },
    fromOptionsCoin: {
      // this can be Path object, string, array or Object (Path.fromOptions)
      path: 'm/44\'/1\'/0\'/0/0',
      // this can be Coin, Buffer, hex string or Object (Output.fromOptions)
      coin: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt',
        hash: Buffer.from('a734a508b9621e382dbde17a87aaa03ade516fe6fbee87a8ae89'
            + '55e3de370067', 'hex'),
        index: 0
      },
      witness: true,
      multisig: {
        m: 2,
        pubkeys: [
          {
            xpub: 'tpubDC5FSnBiZDMmkoat4aZFfbJdEthnPqJ1jXZcKWJNKC4yJanLA55dRW5q'
                + 'KJRRvAo1SwaXeUx2ayUQyVJ6eCbABbBB8Wn3T7dAuVJRnZgntVC',
            path: 'm/0/2',
            signature: ''
          },
          {
            xpub: 'tpubDDBsptAyNXagWcEAR9eciiBeQMF4Qfmceocb31Bnbw1t3J7iCivcqdHu'
                + 'nBVkNnjMgyMzof4pUW8e15dHbLZ95QpafhNtMKE6T4rQFh5fHSF',
            path: 'm/0/2',
            signature: '3045022100cb54262827812b9616e79ba06da9a2dceecbcb0dc78ad'
                     + '707398044a0551cfb4f0220219cf5d0123554b5ddbbcc3395566bb5'
                     + 'a6599c9d4936281fef830738a7bba7f801'
          }
        ]
      }
    },
    fromJSON: {
      path: 'm/44\'/1\'/0\'/0/0',
      witness: true,
      prevTX: null,
      prevout: {
        hash: '670037dee35589aea887eefbe66f51de3aa0aa877ae1bd2d381e62b908a534a7',
        index: 0
      },
      output: {
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt'
      },
      multisig: {
        m: 2,
        pubkeys: [
          {
            xpub: 'tpubDC5FSnBiZDMmkoat4aZFfbJdEthnPqJ1jXZcKWJNKC4yJanLA55dRW5q'
                + 'KJRRvAo1SwaXeUx2ayUQyVJ6eCbABbBB8Wn3T7dAuVJRnZgntVC',
            path: 'm/0/2',
            signature: ''
          },
          {
            xpub: 'tpubDDBsptAyNXagWcEAR9eciiBeQMF4Qfmceocb31Bnbw1t3J7iCivcqdHu'
                + 'nBVkNnjMgyMzof4pUW8e15dHbLZ95QpafhNtMKE6T4rQFh5fHSF',
            path: 'm/0/2',
            signature: '3045022100cb54262827812b9616e79ba06da9a2dceecbcb0dc78ad'
                     + '707398044a0551cfb4f0220219cf5d0123554b5ddbbcc3395566bb5'
                     + 'a6599c9d4936281fef830738a7bba7f801'
          }
        ]
      }
    },
    fromJSONCoin: {
      prevTX: null,
      path: 'm/44\'/1\'/0\'/0/0',
      witness: true,
      coin: {
        version: 1,
        height: -1,
        coinbase: false,
        hash: '670037dee35589aea887eefbe66f51de3aa0aa877ae1bd2d381e62b908a534a7',
        index: 0,
        value: 99997730,
        script: '76a9143a2d4145a4f098523b3e8127f1da87cfc55b8e7988ac',
        address: '16JcQVoL61QsLCPS6ek8UJZ52eRfaFqLJt'
      },
      multisig: {
        m: 2,
        pubkeys: [
          {
            xpub: 'tpubDC5FSnBiZDMmkoat4aZFfbJdEthnPqJ1jXZcKWJNKC4yJanLA55dRW5q'
                + 'KJRRvAo1SwaXeUx2ayUQyVJ6eCbABbBB8Wn3T7dAuVJRnZgntVC',
            path: 'm/0/2',
            signature: ''
          },
          {
            xpub: 'tpubDDBsptAyNXagWcEAR9eciiBeQMF4Qfmceocb31Bnbw1t3J7iCivcqdHu'
                + 'nBVkNnjMgyMzof4pUW8e15dHbLZ95QpafhNtMKE6T4rQFh5fHSF',
            path: 'm/0/2',
            signature: '3045022100cb54262827812b9616e79ba06da9a2dceecbcb0dc78ad'
                     + '707398044a0551cfb4f0220219cf5d0123554b5ddbbcc3395566bb5'
                     + 'a6599c9d4936281fef830738a7bba7f801'
          }
        ]
      }
    }
  }
];

describe('Input formats', function () {
  const network = 'main';

  for (const vector of vectors) {
    it(`should create InputData from Options (${vector.name})`, function() {
      if (vector.fromOptions == null)
        this.skip();

      const optionTypes = [];
      const witness = vector.fromOptions.witness;

      optionTypes.push(...allPathTypes(vector.fromOptions));

      if (!witness)
        optionTypes.push(...allTXTypes(vector.fromOptions));

      optionTypes.push(...allOutputTypes(vector.fromOptions, !witness));
      optionTypes.push(...allPrevoutTypes(vector.fromOptions));

      for (const options of optionTypes) {
        const inputData = InputData.fromOptions(options);
        assert.deepStrictEqual(inputData.getJSON('main'), vector.fromJSON);
      }
    });

    it(`should create InputData from Options with Coin (${vector.name})`, () => {
      const optionTypes = [];

      const allowMinimal = vector.fromOptionsCoin.prevout != null;
      optionTypes.push(...allCoinTypes(vector.fromOptionsCoin, allowMinimal));

      for (const options of optionTypes) {
        const inputData = new InputData(options);
        assert.deepStrictEqual(inputData.getJSON(network), vector.fromJSON);
      }
    });

    it(`should create InputData from JSON (${vector.name})`, () => {
      const inputData = InputData.fromJSON(vector.fromJSON);
      assert.deepStrictEqual(inputData.getJSON(network), vector.fromJSON);
    });

    it(`should create InputData from JSON with Coin (${vector.name})`, () => {
      const inputData = InputData.fromJSON(vector.fromJSONCoin);
      assert.deepStrictEqual(inputData.getJSON(network), vector.fromJSON);
    });
  }
});

function allPathTypes(options) {
  const optionTypes = [];

  const path = Path.fromOptions(options.path);

  // Path object
  optionTypes.push({
    ...options,
    path: path
  });

  // Path = array
  optionTypes.push({
    ...options,
    path: path.toList()
  });

  // Path = string
  optionTypes.push({
    ...options,
    path:  path.toString()
  });

  return optionTypes;
}

function allTXTypes(options) {
  const optionTypes = [];

  const rawTX = Buffer.from(options.prevTX, 'hex');
  const tx = TX.fromRaw(rawTX);

  // prevTX = TX
  optionTypes.push({
    ...options,
    prevTX: tx
  });

  // prevTX = Buffer
  optionTypes.push({
    ...options,
    prevTX: rawTX
  });

  // prevTX = string
  optionTypes.push({
    ...options,
    prevTX: options.prevTX
  });

  return optionTypes;
}

function allOutputTypes(options, includeNull = false) {
  const optionTypes = [];

  const outputOptions = options.output;
  const script = Buffer.from(outputOptions.script, 'hex');
  const output = Output.fromOptions({
    value: outputOptions.value,
    script: script,
    address: outputOptions.address
  });

  // output = Output
  optionTypes.push({
    ...options,
    output: output
  });

  // output = Buffer
  optionTypes.push({
    ...options,
    outpoint: output.toRaw()
  });

  // output = hex string
  optionTypes.push({
    ...options,
    outpoint: output.toRaw().toString('hex')
  });

  // we have prevTX or coin
  if (includeNull) {
    optionTypes.push({
      ...options,
      output: null
    });
  }

  return optionTypes;
}

function allPrevoutTypes(options, includeNull = false) {
  const optionTypes = [];

  const prevout = Outpoint.fromOptions(options.prevout);

  // prevout = Outpoint
  optionTypes.push({
    ...options,
    prevout: prevout
  });

  // prevout = buffer
  optionTypes.push({
    ...options,
    prevout: prevout.toRaw()
  });

  // prevout = hex string
  optionTypes.push({
    ...options,
    prevout: prevout.toRaw().toString('hex')
  });

  // prevout = object
  optionTypes.push({
    ...options,
    prevout: options.prevout
  });

  // we have coin.
  if (includeNull) {
    options.push({
      ...options,
      prevout: null
    });
  }

  return optionTypes;
}

function allCoinTypes(options, includeMinimal = false) {
  const optionTypes = [];

  const script = Buffer.from(options.coin.script, 'hex');

  // Coin
  const coin = Coin.fromOptions({
    ...options.coin,
    script: script
  });

  const buffer = coin.toRaw();
  const hexString = buffer.toString('hex');

  // coin = Coin
  optionTypes.push({
    ...options,
    coin: coin
  });

  if (includeMinimal) {
    // coin = Buffer | This needs prevout
    optionTypes.push({
      ...options,
      coin: buffer
    });

    // coin = hex string
    optionTypes.push({
      ...options,
      coin: hexString
    });
  }

  // coin = object
  optionTypes.push(options);

  return optionTypes;
}
