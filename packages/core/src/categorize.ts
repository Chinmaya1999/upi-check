export interface Category { id: string; label: string; icon: string; color: string }

export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Food & Dining', icon: 'restaurant', color: '#F59F00' },
  { id: 'groceries', label: 'Groceries', icon: 'basket', color: '#40C057' },
  { id: 'transport', label: 'Transport', icon: 'car', color: '#339AF0' },
  { id: 'shopping', label: 'Shopping', icon: 'bag', color: '#CC5DE8' },
  { id: 'bills', label: 'Bills & Utilities', icon: 'flash', color: '#20C997' },
  { id: 'entertainment', label: 'Entertainment', icon: 'film', color: '#FF6B6B' },
  { id: 'health', label: 'Health', icon: 'medkit', color: '#F06595' },
  { id: 'travel', label: 'Travel', icon: 'airplane', color: '#5C7CFA' },
  { id: 'rent', label: 'Rent & Housing', icon: 'home', color: '#868E96' },
  { id: 'income', label: 'Income', icon: 'cash', color: '#12B886' },
  { id: 'transfer', label: 'Transfers', icon: 'swap-horizontal', color: '#748FFC' },
  { id: 'uncategorized', label: 'Needs review', icon: 'help-circle', color: '#ADB5BD' },
];

const RULES: [RegExp, string][] = [
  [/swiggy|zomato|dominos|domino's|mcdonald|kfc|starbucks|cafe|restaurant|biryani|pizza|bakery|chai/i, 'food'],
  [/bigbasket|blinkit|zepto|dmart|grofers|instamart|reliance fresh|grocery|kirana|vegetable/i, 'groceries'],
  [/uber|ola\b|rapido|irctc|metro|fastag|petrol|fuel|indian oil|hpcl|bpcl|parking/i, 'transport'],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|croma|decathlon/i, 'shopping'],
  [/electricity|bescom|tneb|bsnl|airtel|jio|vodafone|vi\b|recharge|broadband|gas|water bill|dth|tata play|insurance|lic\b/i, 'bills'],
  [/netflix|spotify|hotstar|prime video|bookmyshow|pvr|inox|youtube|gaming/i, 'entertainment'],
  [/pharmacy|apollo|medplus|1mg|pharmeasy|hospital|clinic|diagnostic|lab\b|doctor/i, 'health'],
  [/makemytrip|goibibo|indigo|air india|oyo|airbnb|booking\.com|redbus/i, 'travel'],
  [/rent|landlord|maintenance|society/i, 'rent'],
  [/salary|payroll|interest credit|dividend|stipend/i, 'income'],
];

export function categorize(merchant: string, narration: string, direction: 'debit' | 'credit'): { categoryId: string; needsReview: boolean } {
  const hay = `${merchant} ${narration}`;
  for (const [re, id] of RULES) {
    if (re.test(hay)) {
      // A salary rule must not tag an outgoing payment as income.
      if (id === 'income' && direction === 'debit') continue;
      return { categoryId: id, needsReview: false };
    }
  }
  // Unknown merchants are flagged for review, never guessed.
  return { categoryId: 'uncategorized', needsReview: true };
}
