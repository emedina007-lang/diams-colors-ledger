// Seeded from diamscolorsllc.squarespace.com service list.
// "price" is a starting suggestion only — always editable per invoice.
export const MATERIALS = [
  { name: 'Interior Paint',            price: 3.50 },
  { name: 'Exterior Paint',            price: 4.00 },
  { name: 'Deck Stain / Sealant',      price: 3.75 },
  { name: 'Fence Paint / Stain',       price: 3.25 },
  { name: 'Porch Paint / Stain',       price: 3.50 },
  { name: 'Foundation / Concrete Coating', price: 4.50 },
  { name: 'Waterproof Sealant',        price: 5.00 },
  { name: 'Wood Repair Material',      price: 4.25 },
  { name: 'Retaining Wall Sealant',    price: 4.00 },
  { name: 'Pressure Washing Treatment', price: 2.50 },
  { name: 'Other', price: null },
];

// Suggestions only (job type stays free text) so the field autocompletes
// without restricting real-world one-off jobs.
export const JOB_TYPE_SUGGESTIONS = [
  'Interior Painting',
  'Exterior Painting',
  'Deck Staining / Refinishing',
  'Fence Painting / Staining',
  'Porch Painting / Staining',
  'Foundation Painting / Concrete Coating',
  'Pressure Washing',
  'Wood Repair / Restoration',
  'Retaining Wall Painting / Sealing',
  'Closet Design / Remodeling',
  'Screening / Porch Installation',
  'Renovation / Remodel',
];
