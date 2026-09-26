const sortAsc = { value: true };
const sortCol = { value: 'price' };
const offers = { value: [
  { price: 18.43, id: 1 },
  { price: 18.43, id: 2 },
  { price: 18.43, id: 3 },
  { price: 1, id: 4 },
  { price: 1, id: 5 },
  { price: 1, id: 6 },
  { price: 18.43, id: 7 }
]};

const sorted = [...offers.value].sort((a, b) => {
  let av, bv;
  if (sortCol.value === 'price') { av = a.price; bv = b.price; }
  
  if (av === bv) return 0;
  const cmp = av < bv ? -1 : 1;
  return sortAsc.value ? cmp : -cmp;
});

console.log(sorted.map(o => o.price));
