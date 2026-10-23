import type { Intake } from './intake.js';

// Demo-mode output for the bundled sample purchase order (public/samples/PO-1045.pdf).
export function demoIntake(): Intake {
  return {
    po: {
      poNumber: 'PO-1045',
      supplierName: 'Bat Trang Studio Pottery',
      supplierCountry: 'Vietnam',
      supplierContact: 'Nguyen Thi Hoa',
      productName: 'Ash-Glaze Stoneware Mug (set of 2)',
      sku: 'KC-MUG-04',
      quantity: 900,
      unitCost: 11.4,
      currency: 'USD',
      depositPct: 40,
      balanceTerms: '60% balance due before shipment, after pre-shipment inspection is passed',
      incoterm: 'FOB Haiphong',
      originPort: 'Haiphong (VNHPH)',
      destinationPort: 'Long Beach (USLGB)',
      shipMode: 'sea',
      orderDate: '2026-10-23',
      spec: [
        { key: 'Glaze', value: 'Matte ash-white glaze with iron speckle' },
        { key: 'Capacity', value: '350 ml, ±10 ml' },
        { key: 'Mark', value: 'Stamped "KILN & CO" under the base' },
        { key: 'Packaging', value: 'Two mugs per kraft gift box, label KC-MUG-04' },
      ],
      qcRequirements: ['Glaze matches the ash-white sample', 'No cracks, pinholes or chips', 'Base stamp legible', 'Gift box label shows KC-MUG-04'],
    },
    plan: {
      tasks: [
        { key: 'deposit', name: '40% deposit to Bat Trang Studio Pottery', kind: 'payment', durationDays: 0, dependsOn: [], paymentType: 'deposit', why: 'Production starts once the deposit clears.' },
        { key: 'prod', name: 'Throwing, glazing & firing', kind: 'production', durationDays: 35, dependsOn: ['deposit'], paymentType: 'none', why: 'PO states 35 days production lead time.' },
        { key: 'qc', name: 'Pre-shipment QC inspection (AI-verified)', kind: 'qc', durationDays: 2, dependsOn: ['prod'], paymentType: 'none', why: 'Photo inspection plus factory re-check.' },
        { key: 'balance', name: '60% balance · released on QC pass', kind: 'payment', durationDays: 0, dependsOn: ['qc'], paymentType: 'balance', why: 'Balance is due before shipment, after inspection.' },
        { key: 'load', name: 'Truck to Haiphong port & load', kind: 'freight', durationDays: 3, dependsOn: ['balance'], paymentType: 'none', why: 'Inland haul plus port cut-off.' },
        { key: 'sea', name: 'Ocean freight · Haiphong → Long Beach', kind: 'freight', durationDays: 19, dependsOn: ['load'], paymentType: 'none', why: 'Typical transpacific transit for this lane.' },
        { key: 'customs', name: 'US customs clearance', kind: 'customs', durationDays: 2, dependsOn: ['sea'], paymentType: 'none', why: 'Standard ISF/entry for ceramics.' },
        { key: 'wh', name: 'Drayage & warehouse receiving', kind: 'warehouse', durationDays: 2, dependsOn: ['customs'], paymentType: 'none', why: 'Port to Ontario, CA and putaway.' },
        { key: 'launch', name: 'Restock goes live', kind: 'launch', durationDays: 0, dependsOn: ['wh'], paymentType: 'none', why: 'Inventory available to sell.' },
      ],
      assumptions: ['Deposit is paid today', 'No Lunar New Year closure in this window', 'FOB means Kiln & Co books the ocean freight'],
    },
  };
}
