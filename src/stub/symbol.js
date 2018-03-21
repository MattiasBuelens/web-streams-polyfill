const FakeSymbol = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ?
  Symbol :
  description => `Symbol(${description})`;

export default FakeSymbol;
