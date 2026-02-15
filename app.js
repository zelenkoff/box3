// ============================================================
// Netherlands Tax Calculator — 2025 vs 2028
// ============================================================

// --- TAX RULES DATA ---

const TAX_RULES = {
  2025: {
    box1: {
      brackets: [
        { from: 0, to: 38441, rate: 0.3582 },
        { from: 38441, to: 76817, rate: 0.3748 },
        { from: 76817, to: Infinity, rate: 0.4950 },
      ],
      arbeidskorting: {
        // Stepped build-up and phase-out for 2025
        steps: [
          { from: 0, to: 11491, rate: 0.08425 },
          { from: 11491, to: 24821, rate: 0.31433 },
          { from: 24821, to: 39958, rate: 0.02471 },
          { from: 39958, to: 124935, rate: -0.06510 },
        ],
        max: 5599,
        min: 0,
      },
      algHeffingskorting: {
        max: 3068,
        phaseOutStart: 28406,
        phaseOutRate: 0.06337,
        min: 0,
      },
    },
    box2: {
      brackets: [
        { from: 0, to: 68843, rate: 0.245 },
        { from: 68843, to: Infinity, rate: 0.31 },
      ],
    },
    box3: {
      type: 'fictional',
      exemption: 57684, // per person
      fictionalRates: {
        savings: 0.0144,
        investments: 0.0588, // stocks, crypto, bonds, real estate
        debts: 0.0262,
      },
      taxRate: 0.36,
    },
  },
  2028: {
    box1: {
      // 2028 Box 1 rates not yet published — use 2025 as baseline
      brackets: [
        { from: 0, to: 38441, rate: 0.3582 },
        { from: 38441, to: 76817, rate: 0.3748 },
        { from: 76817, to: Infinity, rate: 0.4950 },
      ],
      arbeidskorting: {
        steps: [
          { from: 0, to: 11491, rate: 0.08425 },
          { from: 11491, to: 24821, rate: 0.31433 },
          { from: 24821, to: 39958, rate: 0.02471 },
          { from: 39958, to: 124935, rate: -0.06510 },
        ],
        max: 5599,
        min: 0,
      },
      algHeffingskorting: {
        max: 3068,
        phaseOutStart: 28406,
        phaseOutRate: 0.06337,
        min: 0,
      },
    },
    box2: {
      brackets: [
        { from: 0, to: 68843, rate: 0.245 },
        { from: 68843, to: Infinity, rate: 0.31 },
      ],
    },
    box3: {
      type: 'actual',
      taxFreeReturn: 1800, // per person per year
      taxRate: 0.36,
      // Note: loss carry-forward is unlimited but not modeled multi-year
    },
  },
};

// --- FORMATTING UTILITIES ---

function formatEUR(amount) {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(Math.round(amount));
  return sign + '€' + abs.toLocaleString('nl-NL');
}

function formatPercent(rate) {
  return (rate * 100).toFixed(1) + '%';
}

// --- CALCULATION ENGINE (pure functions) ---

function calculateArbeidskorting(income, config) {
  if (income <= 0) return 0;
  let credit = 0;
  for (const step of config.steps) {
    if (income <= step.from) break;
    const base = Math.min(income, step.to) - step.from;
    if (base <= 0) continue;
    credit += base * step.rate;
  }
  return Math.max(config.min, Math.min(config.max, credit));
}

function calculateHeffingskorting(aggregateIncome, config) {
  if (aggregateIncome <= config.phaseOutStart) return config.max;
  const reduction = (aggregateIncome - config.phaseOutStart) * config.phaseOutRate;
  return Math.max(config.min, config.max - reduction);
}

function calculateBox1(params, rules, aggregateIncome) {
  let taxableIncome = params.salary;

  // 30% ruling
  if (params.thirtyPercentRuling) {
    taxableIncome = taxableIncome * 0.70;
  }

  // Mortgage interest deduction
  taxableIncome = Math.max(0, taxableIncome - params.mortgageInterest);

  // Gross tax via brackets
  let grossTax = 0;
  const bracketDetails = [];
  for (const bracket of rules.brackets) {
    if (taxableIncome <= bracket.from) break;
    const taxableInBracket = Math.min(taxableIncome, bracket.to) - bracket.from;
    const taxInBracket = taxableInBracket * bracket.rate;
    grossTax += taxInBracket;
    if (taxableInBracket > 0) {
      bracketDetails.push({
        range: `${formatEUR(bracket.from)} – ${bracket.to === Infinity ? '...' : formatEUR(bracket.to)}`,
        rate: formatPercent(bracket.rate),
        taxable: taxableInBracket,
        tax: taxInBracket,
      });
    }
  }

  // Tax credits
  const arbeidskorting = calculateArbeidskorting(taxableIncome, rules.arbeidskorting);
  const heffingskorting = calculateHeffingskorting(aggregateIncome, rules.algHeffingskorting);
  const totalCredits = arbeidskorting + heffingskorting;
  const netTax = Math.max(0, grossTax - totalCredits);

  return {
    taxableIncome,
    grossTax,
    arbeidskorting,
    heffingskorting,
    totalCredits,
    netTax,
    bracketDetails,
  };
}

function calculateBox2(params, rules) {
  const income = params.box2Income;
  if (income <= 0) return { income: 0, tax: 0, bracketDetails: [] };

  let tax = 0;
  const bracketDetails = [];
  for (const bracket of rules.brackets) {
    if (income <= bracket.from) break;
    const taxableInBracket = Math.min(income, bracket.to) - bracket.from;
    const taxInBracket = taxableInBracket * bracket.rate;
    tax += taxInBracket;
    if (taxableInBracket > 0) {
      bracketDetails.push({
        range: `${formatEUR(bracket.from)} – ${bracket.to === Infinity ? '...' : formatEUR(bracket.to)}`,
        rate: formatPercent(bracket.rate),
        taxable: taxableInBracket,
        tax: taxInBracket,
      });
    }
  }

  return { income, tax, bracketDetails };
}

function calculateBox3Fictional(assets, rules, hasPartner) {
  const exemption = rules.exemption * (hasPartner ? 2 : 1);

  // Category totals
  const savingsTotal = assets.savings;
  const investmentsTotal = assets.stocks + assets.crypto + assets.bonds + assets.realEstate;
  const debtsTotal = assets.debts;

  const grossAssets = savingsTotal + investmentsTotal;
  const netAssets = grossAssets - debtsTotal;

  if (netAssets <= exemption) {
    return {
      savingsTotal,
      investmentsTotal,
      debtsTotal,
      grossAssets,
      netAssets,
      exemption,
      taxableBase: 0,
      fictionalReturn: 0,
      tax: 0,
    };
  }

  const taxableBase = netAssets - exemption;

  // Proportional fictional return: weight each category by its share of gross assets
  // If gross assets are 0, there's nothing to tax
  let fictionalReturn = 0;
  if (grossAssets > 0) {
    const savingsPortion = savingsTotal / grossAssets;
    const investmentPortion = investmentsTotal / grossAssets;

    // Weighted fictional rate
    const weightedRate =
      savingsPortion * rules.fictionalRates.savings +
      investmentPortion * rules.fictionalRates.investments;

    // Subtract debt fictional return proportionally
    let debtDeduction = 0;
    if (debtsTotal > 0) {
      debtDeduction = debtsTotal * rules.fictionalRates.debts;
    }

    fictionalReturn = taxableBase * weightedRate;
    // Debt deduction reduces the return, but proportional to how much of gross is debt
    // In practice the NL system is more nuanced — this is a simplified model
  } else {
    fictionalReturn = 0;
  }

  // Simpler approach matching the actual NL method more closely:
  // Fictional return = savings_share * savings_rate + investment_share * investment_rate
  // applied on the taxable base (net assets - exemption), with debt reducing assets
  // We recalculate using the standard method:
  let fictionalReturnCalc = 0;
  if (grossAssets > 0) {
    const savingsReturn = savingsTotal * rules.fictionalRates.savings;
    const investmentsReturn = investmentsTotal * rules.fictionalRates.investments;
    const debtsReturn = debtsTotal * rules.fictionalRates.debts;

    const totalFictionalReturn = savingsReturn + investmentsReturn - debtsReturn;

    // The fictional return is proportioned to the taxable base
    if (netAssets > 0) {
      fictionalReturnCalc = totalFictionalReturn * (taxableBase / netAssets);
    }
  }

  const tax = Math.max(0, fictionalReturnCalc * rules.taxRate);

  return {
    savingsTotal,
    investmentsTotal,
    debtsTotal,
    grossAssets,
    netAssets,
    exemption,
    taxableBase,
    fictionalReturn: fictionalReturnCalc,
    tax,
  };
}

function calculateBox3Actual(assets, expectedReturns, rentalIncome, rules, hasPartner) {
  const taxFreeReturn = rules.taxFreeReturn * (hasPartner ? 2 : 1);

  // Actual returns per asset class
  const savingsReturn = assets.savings * (expectedReturns.savings / 100);
  const stocksReturn = assets.stocks * (expectedReturns.stocks / 100);
  const cryptoReturn = assets.crypto * (expectedReturns.crypto / 100);
  const bondsReturn = assets.bonds * (expectedReturns.bonds / 100);
  // Real estate: only rental income taxed annually (appreciation taxed on sale)
  const realEstateReturn = rentalIncome;

  const totalReturn = savingsReturn + stocksReturn + cryptoReturn + bondsReturn + realEstateReturn;

  const taxableReturn = Math.max(0, totalReturn - taxFreeReturn);
  const tax = taxableReturn * rules.taxRate;

  return {
    savingsReturn,
    stocksReturn,
    cryptoReturn,
    bondsReturn,
    realEstateReturn,
    totalReturn,
    taxFreeReturn,
    taxableReturn,
    tax,
    // For display of unrealized gains note
    unrealizedNote: assets.realEstate > 0
      ? `Real estate appreciation (${expectedReturns.realEstate}%) taxed on sale, not annually.`
      : null,
  };
}

function compareYears(inputs) {
  const results = {};

  for (const year of [2025, 2028]) {
    const rules = TAX_RULES[year];

    // Aggregate income for heffingskorting phase-out
    const box1TaxableForAgg = inputs.thirtyPercentRuling
      ? inputs.salary * 0.70 - inputs.mortgageInterest
      : inputs.salary - inputs.mortgageInterest;
    const aggregateIncome = Math.max(0, box1TaxableForAgg) + inputs.box2Income;

    const box1 = calculateBox1(inputs, rules.box1, aggregateIncome);
    const box2 = calculateBox2(inputs, rules.box2);

    let box3;
    if (inputs.thirtyPercentRuling) {
      // 30% ruling: opt for partial non-resident status → Box 3 exempt
      box3 = {
        savingsTotal: inputs.assets.savings,
        investmentsTotal: inputs.assets.stocks + inputs.assets.crypto + inputs.assets.bonds + inputs.assets.realEstate,
        debtsTotal: inputs.assets.debts,
        grossAssets: inputs.assets.savings + inputs.assets.stocks + inputs.assets.crypto + inputs.assets.bonds + inputs.assets.realEstate,
        netAssets: inputs.assets.savings + inputs.assets.stocks + inputs.assets.crypto + inputs.assets.bonds + inputs.assets.realEstate - inputs.assets.debts,
        exemption: 0,
        taxableBase: 0,
        fictionalReturn: 0,
        taxFreeReturn: 0,
        taxableReturn: 0,
        totalReturn: 0,
        tax: 0,
        rulingExempt: true,
      };
    } else if (rules.box3.type === 'fictional') {
      box3 = calculateBox3Fictional(inputs.assets, rules.box3, inputs.fiscalPartner);
    } else {
      box3 = calculateBox3Actual(
        inputs.assets,
        inputs.expectedReturns,
        inputs.rentalIncome,
        rules.box3,
        inputs.fiscalPartner
      );
    }

    const totalTax = box1.netTax + box2.tax + box3.tax;

    // Net income is what you actually take home (salary + box2 - all taxes)
    // Box 3 returns are mostly unrealized, so they don't count as spendable income
    const earnedIncome = inputs.salary + inputs.box2Income;
    const netIncome = earnedIncome - totalTax;

    // Effective rate on earned income (the traditional way)
    const effectiveRate = earnedIncome > 0 ? totalTax / earnedIncome : 0;

    results[year] = { box1, box2, box3, totalTax, netIncome, effectiveRate, totalIncome: earnedIncome };
  }

  const difference = results[2028].totalTax - results[2025].totalTax;

  return { results, difference };
}

// --- UI LOGIC ---

function getNumVal(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

function getBoolVal(id) {
  return document.getElementById(id).checked;
}

// --- URL STATE MANAGEMENT ---

function saveStateToURL() {
  const inputs = gatherInputs();
  const params = new URLSearchParams();

  // Save all input values
  params.set('salary', inputs.salary);
  params.set('thirtyPercent', inputs.thirtyPercentRuling ? '1' : '0');
  params.set('mortgage', inputs.mortgageInterest);
  params.set('partner', inputs.fiscalPartner ? '1' : '0');
  params.set('box2', inputs.box2Income);
  params.set('savings', inputs.assets.savings);
  params.set('stocks', inputs.assets.stocks);
  params.set('crypto', inputs.assets.crypto);
  params.set('bonds', inputs.assets.bonds);
  params.set('realEstate', inputs.assets.realEstate);
  params.set('debts', inputs.assets.debts);
  params.set('rental', inputs.rentalIncome);
  params.set('rSavings', inputs.expectedReturns.savings);
  params.set('rStocks', inputs.expectedReturns.stocks);
  params.set('rCrypto', inputs.expectedReturns.crypto);
  params.set('rBonds', inputs.expectedReturns.bonds);
  params.set('rRealEstate', inputs.expectedReturns.realEstate);

  // Update URL without reload
  const newURL = window.location.pathname + '?' + params.toString();
  window.history.replaceState({}, '', newURL);
}

function loadStateFromURL() {
  const params = new URLSearchParams(window.location.search);

  if (params.toString() === '') return; // No params, use defaults

  // Load all values if they exist in URL
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== null) {
      if (el.type === 'checkbox') {
        el.checked = value === '1';
      } else {
        el.value = value;
      }
    }
  };

  setValue('salary', params.get('salary'));
  setValue('thirtyPercentRuling', params.get('thirtyPercent'));
  setValue('mortgageInterest', params.get('mortgage'));
  setValue('fiscalPartner', params.get('partner'));
  setValue('box2Income', params.get('box2'));
  setValue('savings', params.get('savings'));
  setValue('stocks', params.get('stocks'));
  setValue('crypto', params.get('crypto'));
  setValue('bonds', params.get('bonds'));
  setValue('realEstate', params.get('realEstate'));
  setValue('debts', params.get('debts'));
  setValue('rentalIncome', params.get('rental'));
  setValue('returnSavings', params.get('rSavings'));
  setValue('returnStocks', params.get('rStocks'));
  setValue('returnCrypto', params.get('rCrypto'));
  setValue('returnBonds', params.get('rBonds'));
  setValue('returnRealEstate', params.get('rRealEstate'));
}

function gatherInputs() {
  return {
    salary: getNumVal('salary'),
    thirtyPercentRuling: getBoolVal('thirtyPercentRuling'),
    mortgageInterest: getNumVal('mortgageInterest'),
    fiscalPartner: getBoolVal('fiscalPartner'),
    box2Income: getNumVal('box2Income'),
    assets: {
      savings: getNumVal('savings'),
      stocks: getNumVal('stocks'),
      crypto: getNumVal('crypto'),
      bonds: getNumVal('bonds'),
      realEstate: getNumVal('realEstate'),
      debts: getNumVal('debts'),
    },
    rentalIncome: getNumVal('rentalIncome'),
    expectedReturns: {
      savings: getNumVal('returnSavings'),
      stocks: getNumVal('returnStocks'),
      crypto: getNumVal('returnCrypto'),
      bonds: getNumVal('returnBonds'),
      realEstate: getNumVal('returnRealEstate'),
    },
  };
}

function makeLine(label, value, cssClass) {
  return `<div class="line ${cssClass || ''}">`
    + `<span>${label}</span><span>${value}</span>`
    + `</div>`;
}

function renderColumnBox1(box1, year) {
  let html = '<h4>BOX 1 — EMPLOYMENT</h4>';

  // Summary line with clickable details
  let detailsHtml = '';
  for (const b of box1.bracketDetails) {
    detailsHtml += makeLine(`${b.range} @ ${b.rate}`, formatEUR(b.tax), 'indent');
  }
  detailsHtml += makeLine(
    'Arbeidskorting',
    '-' + formatEUR(box1.arbeidskorting),
    'indent'
  );
  detailsHtml += makeLine(
    'Heffingskorting',
    '-' + formatEUR(box1.heffingskorting),
    'indent'
  );

  html += `<details class="box-details">
    <summary class="box-summary">TAX: ${formatEUR(box1.netTax)} [?]</summary>
    <div class="box-details-content">
      ${makeLine('Taxable income', formatEUR(box1.taxableIncome))}
      ${makeLine('Gross tax', formatEUR(box1.grossTax))}
      ${detailsHtml}
    </div>
  </details>`;
  return html;
}

function renderColumnBox2(box2) {
  let html = '<h4>BOX 2 — SUBSTANTIAL INTEREST</h4>';
  if (box2.income <= 0) {
    html += makeLine('TAX', '—');
    return html;
  }

  let detailsHtml = '';
  for (const b of box2.bracketDetails) {
    detailsHtml += makeLine(`${b.range} @ ${b.rate}`, formatEUR(b.tax), 'indent');
  }

  html += `<details class="box-details">
    <summary class="box-summary">TAX: ${formatEUR(box2.tax)} [?]</summary>
    <div class="box-details-content">
      ${makeLine('Income', formatEUR(box2.income))}
      ${detailsHtml}
    </div>
  </details>`;
  return html;
}

function renderColumnBox3_2025(box3) {
  let html = '<h4>BOX 3 — SAVINGS & INVESTMENTS</h4>';
  if (box3.rulingExempt) {
    html += makeLine('30% RULING EXEMPT', '—');
    html += makeLine('TAX @ 36%', formatEUR(0), 'total');
    return html;
  }
  html += makeLine('Savings', formatEUR(box3.savingsTotal));
  html += makeLine('Investments', formatEUR(box3.investmentsTotal));
  html += makeLine('Debts', '-' + formatEUR(box3.debtsTotal));
  html += makeLine('Net assets', formatEUR(box3.netAssets));
  html += makeLine('Exemption', '-' + formatEUR(box3.exemption));
  html += makeLine('Taxable base', formatEUR(box3.taxableBase));
  html += makeLine('Fictional return', formatEUR(box3.fictionalReturn), 'indent');
  html += makeLine('TAX @ 36%', formatEUR(box3.tax), 'total');
  return html;
}

function renderColumnBox3_2028(box3) {
  let html = '<h4>BOX 3 — ACTUAL RETURN (INCL. UNREALIZED)</h4>';
  if (box3.rulingExempt) {
    html += makeLine('30% RULING EXEMPT', '—');
    html += makeLine('TAX @ 36%', formatEUR(0), 'total');
    return html;
  }
  html += makeLine('Savings', formatEUR(box3.savingsReturn), 'indent');
  html += makeLine('Stocks (unrealized)', formatEUR(box3.stocksReturn), 'indent');
  html += makeLine('Crypto (unrealized)', formatEUR(box3.cryptoReturn), 'indent');
  html += makeLine('Bonds', formatEUR(box3.bondsReturn), 'indent');
  html += makeLine('Rental', formatEUR(box3.realEstateReturn), 'indent');
  html += makeLine('Total return', formatEUR(box3.totalReturn));
  html += makeLine('Tax-free', '-' + formatEUR(box3.taxFreeReturn));
  html += makeLine('Taxable', formatEUR(box3.taxableReturn));
  html += makeLine('TAX @ 36%', formatEUR(box3.tax), 'total');
  return html;
}

function renderResults(comparison) {
  const { results, difference } = comparison;

  // --- Difference banner ---
  const banner = document.getElementById('differenceBanner');
  const netIncomeDiff = results[2028].netIncome - results[2025].netIncome;

  if (Math.abs(difference) < 1) {
    banner.className = 'difference-banner neutral';
    banner.textContent = 'No significant difference between 2025 and 2028.';
  } else if (difference < 0) {
    banner.className = 'difference-banner savings';
    banner.textContent = `2028 SAVES ${formatEUR(Math.abs(difference))} TAX — NET INCOME: +${formatEUR(netIncomeDiff)}`;
  } else {
    banner.className = 'difference-banner costs-more';
    banner.textContent = `2028 COSTS ${formatEUR(difference)} MORE TAX — NET INCOME: ${formatEUR(netIncomeDiff)}`;
  }

  // --- 2025 column ---
  const body2025 = document.querySelector('#results2025 .result-body');
  let html2025 = '';
  html2025 += renderColumnBox1(results[2025].box1, 2025);
  html2025 += renderColumnBox2(results[2025].box2);
  html2025 += renderColumnBox3_2025(results[2025].box3);
  html2025 += makeLine('TOTAL TAX', formatEUR(results[2025].totalTax), 'grand-total');
  html2025 += makeLine('NET INCOME', formatEUR(results[2025].netIncome), 'grand-total net-income');
  html2025 += makeLine('EFFECTIVE RATE', formatPercent(results[2025].effectiveRate), '');
  body2025.innerHTML = html2025;

  // --- 2028 column ---
  const body2028 = document.querySelector('#results2028 .result-body');
  let html2028 = '';
  html2028 += renderColumnBox1(results[2028].box1, 2028);
  html2028 += renderColumnBox2(results[2028].box2);
  html2028 += renderColumnBox3_2028(results[2028].box3);
  html2028 += makeLine('TOTAL TAX', formatEUR(results[2028].totalTax), 'grand-total');
  html2028 += makeLine('NET INCOME', formatEUR(results[2028].netIncome), 'grand-total net-income');
  html2028 += makeLine('EFFECTIVE RATE', formatPercent(results[2028].effectiveRate), '');
  body2028.innerHTML = html2028;
}

function renderChart(comparison) {
  const { results } = comparison;

  const data = [
    { label: 'Box 1', v2025: results[2025].box1.netTax, v2028: results[2028].box1.netTax },
    { label: 'Box 2', v2025: results[2025].box2.tax, v2028: results[2028].box2.tax },
    { label: 'Box 3', v2025: results[2025].box3.tax, v2028: results[2028].box3.tax },
    { label: 'Total', v2025: results[2025].totalTax, v2028: results[2028].totalTax },
  ];

  const maxVal = Math.max(...data.map(d => Math.max(d.v2025, d.v2028)), 1);

  let html = '';
  for (const row of data) {
    const w2025 = Math.max(0, (row.v2025 / maxVal) * 100);
    const w2028 = Math.max(0, (row.v2028 / maxVal) * 100);
    html += `
      <div class="chart-row">
        <div class="chart-row-label">${row.label}</div>
        <div class="bar-pair">
          <div class="bar-wrapper">
            <span class="bar-year">2025</span>
            <div class="bar bar-2025" style="width:${w2025}%"></div>
            <span class="bar-value">${formatEUR(row.v2025)}</span>
          </div>
          <div class="bar-wrapper">
            <span class="bar-year">2028</span>
            <div class="bar bar-2028" style="width:${w2028}%"></div>
            <span class="bar-value">${formatEUR(row.v2028)}</span>
          </div>
        </div>
      </div>`;
  }

  html += `
    <div class="chart-legend">
      <div class="legend-item"><span class="legend-swatch c2025"></span> 2025</div>
      <div class="legend-item"><span class="legend-swatch c2028"></span> 2028</div>
    </div>`;

  document.getElementById('barChart').innerHTML = html;
}

// --- PROJECTION CHART ---

function projectPortfolioGrowth(inputs, years) {
  const assets = inputs.assets;
  const returns = inputs.expectedReturns;
  const hasPartner = inputs.fiscalPartner;

  const startingPortfolio = assets.savings + assets.stocks + assets.crypto +
    assets.bonds + assets.realEstate - assets.debts;

  if (startingPortfolio <= 0) return null;

  // Calculate proportions of each asset class (based on gross assets, debts separate)
  const grossAssets = assets.savings + assets.stocks + assets.crypto +
    assets.bonds + assets.realEstate;

  const proportions = grossAssets > 0 ? {
    savings: assets.savings / grossAssets,
    stocks: assets.stocks / grossAssets,
    crypto: assets.crypto / grossAssets,
    bonds: assets.bonds / grossAssets,
    realEstate: assets.realEstate / grossAssets,
    debts: grossAssets > 0 ? assets.debts / grossAssets : 0,
  } : { savings: 0, stocks: 0, crypto: 0, bonds: 0, realEstate: 0, debts: 0 };

  // Blended annual return rate (weighted average)
  const blendedReturn =
    proportions.savings * (returns.savings / 100) +
    proportions.stocks * (returns.stocks / 100) +
    proportions.crypto * (returns.crypto / 100) +
    proportions.bonds * (returns.bonds / 100) +
    proportions.realEstate * (returns.realEstate / 100);

  const noTax = [{ year: 0, value: startingPortfolio }];
  const system2025 = [{ year: 0, value: startingPortfolio }];
  const system2028 = [{ year: 0, value: startingPortfolio }];

  let valNoTax = startingPortfolio;
  let val2025 = startingPortfolio;
  let val2028 = startingPortfolio;

  const rules2025 = TAX_RULES[2025].box3;
  const rules2028 = TAX_RULES[2028].box3;

  const rulingExempt = inputs.thirtyPercentRuling;

  for (let y = 1; y <= years; y++) {
    // --- No tax ---
    valNoTax *= (1 + blendedReturn);
    noTax.push({ year: y, value: valNoTax });

    // --- 2025 system: grow, then pay fictional tax ---
    val2025 *= (1 + blendedReturn);
    if (!rulingExempt) {
      // Scale assets proportionally to current portfolio value for fictional calc
      const scale2025 = val2025 / startingPortfolio;
      const scaledAssets2025 = {
        savings: assets.savings * scale2025,
        stocks: assets.stocks * scale2025,
        crypto: assets.crypto * scale2025,
        bonds: assets.bonds * scale2025,
        realEstate: assets.realEstate * scale2025,
        debts: assets.debts * scale2025,
      };
      const box3_2025 = calculateBox3Fictional(scaledAssets2025, rules2025, hasPartner);
      val2025 -= box3_2025.tax;
    }
    system2025.push({ year: y, value: val2025 });

    // --- 2028 system: grow, then pay actual return tax ---
    const yearReturn2028 = val2028 * blendedReturn;
    val2028 += yearReturn2028;
    if (!rulingExempt) {
      const taxFree = rules2028.taxFreeReturn * (hasPartner ? 2 : 1);
      const taxableReturn = Math.max(0, yearReturn2028 - taxFree);
      const tax2028 = taxableReturn * rules2028.taxRate;
      val2028 -= tax2028;
    }
    system2028.push({ year: y, value: val2028 });
  }

  return { noTax, system2025, system2028 };
}

function renderProjectionChart(inputs, years) {
  const section = document.getElementById('projectionSection');
  const summaryEl = document.getElementById('projectionSummary');
  const container = section.querySelector('.canvas-container');

  const data = projectPortfolioGrowth(inputs, years);

  if (!data) {
    section.style.display = 'block';
    container.innerHTML =
      '<canvas id="projectionCanvas" style="display:none"></canvas>' +
      '<div class="projection-tooltip" id="projectionTooltip"></div>' +
      '<div class="projection-empty">Enter Box 3 assets above to see long-term portfolio projections.</div>';
    summaryEl.innerHTML = '';
    return;
  }

  section.style.display = 'block';

  // Ensure canvas is present (may have been replaced by empty state)
  if (!container.querySelector('canvas')) {
    container.innerHTML = '<canvas id="projectionCanvas"></canvas>' +
      '<div class="projection-tooltip" id="projectionTooltip"></div>';
  }
  // Remove empty message if present
  const emptyMsg = container.querySelector('.projection-empty');
  if (emptyMsg) emptyMsg.remove();

  const cvs = container.querySelector('canvas');
  const tip = container.querySelector('.projection-tooltip');
  cvs.style.display = 'block';

  // DPI scaling
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width;
  const h = rect.height;
  cvs.width = w * dpr;
  cvs.height = h * dpr;
  cvs.style.width = w + 'px';
  cvs.style.height = h + 'px';

  const ctx = cvs.getContext('2d');
  ctx.scale(dpr, dpr);

  // Paddings
  const pad = { top: 30, right: 20, bottom: 35, left: 65 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Value range
  const allValues = [...data.noTax, ...data.system2025, ...data.system2028].map(d => d.value);
  const minVal = 0;
  const maxVal = Math.max(...allValues) * 1.08;

  function xPos(year) { return pad.left + (year / years) * plotW; }
  function yPos(val) { return pad.top + plotH - ((val - minVal) / (maxVal - minVal)) * plotH; }

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Gridlines
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const val = minVal + (maxVal - minVal) * (i / gridLines);
    const y = yPos(val);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#666666';
    ctx.font = '9px "SF Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatEUR(val), pad.left - 8, y);
  }

  // X-axis labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xStep = years <= 10 ? 1 : years <= 20 ? 2 : 5;
  for (let y = 0; y <= years; y += xStep) {
    const x = xPos(y);
    ctx.fillStyle = '#666666';
    ctx.font = '9px "SF Mono", monospace';
    ctx.fillText('Y' + y, x, pad.top + plotH + 8);

    // Vertical gridline
    ctx.strokeStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
  }

  // Draw lines
  function drawLine(series, color, dashed) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash(dashed ? [4, 4] : []);
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const x = xPos(series[i].year);
      const y = yPos(series[i].value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Simple dots
    for (let i = 0; i < series.length; i++) {
      const x = xPos(series[i].year);
      const y = yPos(series[i].value);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw back-to-front so all lines remain visible when they diverge;
  // when lines overlap (e.g. 30% ruling), the dashed no-tax line on top
  // signals that all three are identical.
  drawLine(data.system2028, '#666666', false); // gray (bottom)
  drawLine(data.system2025, '#000000', false); // black (middle)
  drawLine(data.noTax, '#999999', true);       // light grey dashed (top)

  // Legend
  const legendX = pad.left + 10;
  const legendY = pad.top + 6;
  const items = [
    { label: 'NO TAX', color: '#999999', dashed: true },
    { label: '2025', color: '#000000', dashed: false },
    { label: '2028', color: '#666666', dashed: false },
  ];
  ctx.font = '9px "SF Mono", monospace';
  let lx = legendX;
  for (const item of items) {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(item.dashed ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(lx, legendY);
    ctx.lineTo(lx + 15, legendY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, lx + 18, legendY);
    lx += ctx.measureText(item.label).width + 32;
  }

  // Summary below chart
  const finalNoTax = data.noTax[data.noTax.length - 1].value;
  const final2025 = data.system2025[data.system2025.length - 1].value;
  const final2028 = data.system2028[data.system2028.length - 1].value;

  const rulingNote = inputs.thirtyPercentRuling
    ? '<div class="projection-empty" style="padding:0.5rem 0 0">30% ruling active — Box 3 exempt, all scenarios identical.</div>'
    : '';

  summaryEl.innerHTML = `
    <div class="summary-card no-tax">
      <div class="summary-label">No tax</div>
      <div class="summary-value">${formatEUR(finalNoTax)}</div>
    </div>
    <div class="summary-card system-2025">
      <div class="summary-label">2025 system</div>
      <div class="summary-value">${formatEUR(final2025)}</div>
    </div>
    <div class="summary-card system-2028">
      <div class="summary-label">2028 system</div>
      <div class="summary-value">${formatEUR(final2028)}</div>
    </div>
  ` + rulingNote;

  // Hover tooltip
  // Remove old listener if any
  cvs._projMouseMove && cvs.removeEventListener('mousemove', cvs._projMouseMove);
  cvs._projMouseLeave && cvs.removeEventListener('mouseleave', cvs._projMouseLeave);

  cvs._projMouseMove = function (e) {
    const cRect = cvs.getBoundingClientRect();
    const mx = e.clientX - cRect.left;
    const my = e.clientY - cRect.top;

    // Find closest year
    const yearFloat = ((mx - pad.left) / plotW) * years;
    const nearestYear = Math.round(Math.max(0, Math.min(years, yearFloat)));

    if (mx < pad.left - 5 || mx > w - pad.right + 5 || my < pad.top - 5 || my > pad.top + plotH + 5) {
      tip.style.display = 'none';
      return;
    }

    const vNoTax = data.noTax[nearestYear].value;
    const v2025 = data.system2025[nearestYear].value;
    const v2028 = data.system2028[nearestYear].value;

    tip.innerHTML =
      `<strong>Year ${nearestYear}</strong><br>` +
      `No tax: ${formatEUR(vNoTax)}<br>` +
      `2025: ${formatEUR(v2025)}<br>` +
      `2028: ${formatEUR(v2028)}`;
    tip.style.display = 'block';

    // Position tooltip
    let tipX = xPos(nearestYear) + 12;
    let tipY = my - 40;
    const tipRect = tip.getBoundingClientRect();
    if (tipX + tipRect.width > w - 5) tipX = xPos(nearestYear) - tipRect.width - 12;
    if (tipY < 0) tipY = 5;
    tip.style.left = tipX + 'px';
    tip.style.top = tipY + 'px';
  };

  cvs._projMouseLeave = function () {
    tip.style.display = 'none';
  };

  cvs.addEventListener('mousemove', cvs._projMouseMove);
  cvs.addEventListener('mouseleave', cvs._projMouseLeave);
}

function update() {
  const inputs = gatherInputs();
  const comparison = compareYears(inputs);
  renderResults(comparison);
  renderChart(comparison);

  const years = parseInt(document.getElementById('projectionYears').value, 10) || 20;
  renderProjectionChart(inputs, years);

  // Save state to URL
  saveStateToURL();
}

// Debounce helper
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Throttle helper
function throttle(fn, ms) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  // Load state from URL first
  loadStateFromURL();

  const debouncedUpdate = debounce(update, 200);

  // Attach listeners to all inputs
  const inputs = document.querySelectorAll('input[type="number"], input[type="checkbox"]');
  inputs.forEach(input => {
    input.addEventListener('input', debouncedUpdate);
    input.addEventListener('change', debouncedUpdate);
  });

  // Projection slider
  const projSlider = document.getElementById('projectionYears');
  const projLabel = document.getElementById('projectionYearsLabel');
  projSlider.addEventListener('input', () => {
    projLabel.textContent = projSlider.value + ' years';
    debouncedUpdate();
  });

  // Redraw projection on resize
  window.addEventListener('resize', throttle(() => {
    const yrs = parseInt(projSlider.value, 10) || 20;
    renderProjectionChart(gatherInputs(), yrs);
  }, 250));

  // Share button
  const shareBtn = document.getElementById('shareBtn');
  shareBtn.addEventListener('click', async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = 'COPIED!';
      shareBtn.classList.add('copied');
      setTimeout(() => {
        shareBtn.textContent = 'SHARE';
        shareBtn.classList.remove('copied');
      }, 2000);
    } catch (err) {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      shareBtn.textContent = 'COPIED!';
      shareBtn.classList.add('copied');
      setTimeout(() => {
        shareBtn.textContent = 'SHARE';
        shareBtn.classList.remove('copied');
      }, 2000);
    }
  });

  // Initial calculation
  update();
});
