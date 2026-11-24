// Business and motivational quotes for the welcome card on the hub's home page (as in the old intranet). Short,
// well-known lines, shown without an author (many are attributed to more than one person). Add new ones at the end.

export const QUOTES: readonly string[] = [
  'There is only one way to avoid criticism: do nothing, say nothing, and be nothing.',
  'The secret of getting ahead is getting started.',
  'Quality is not an act, it is a habit.',
  'Well done is better than well said.',
  'Opportunities don’t happen. You create them.',
  'The best way to predict the future is to create it.',
  'Success is not final, failure is not fatal: it is the courage to continue that counts.',
  'Don’t watch the clock; do what it does. Keep going.',
  'Your most unhappy customers are your greatest source of learning.',
  'If you don’t build your dream, someone else will hire you to help build theirs.',
  'Great things in business are never done by one person. They’re done by a team of people.',
  'The way to get started is to quit talking and begin doing.',
  'Done is better than perfect.',
  'Price is what you pay. Value is what you get.',
  'It always seems impossible until it’s done.',
  'Small daily improvements are the key to staggering long-term results.',
  'Coming together is a beginning, staying together is progress, and working together is success.',
  'The harder I work, the luckier I get.',
  'Don’t find customers for your products, find products for your customers.',
  'A goal without a plan is just a wish.',
  'Make each day your masterpiece.',
  'Every sale has five basic obstacles: no need, no money, no hurry, no desire, no trust.',
  'You miss 100% of the shots you don’t take.',
  'Action is the foundational key to all success.',
  'Hard work beats talent when talent doesn’t work hard.',
  'Focus on being productive instead of busy.',
  'The customer’s perception is your reality.',
  'Discipline is the bridge between goals and accomplishment.',
  'Do what you can, with what you have, where you are.',
  'Excellence is not a skill. It is an attitude.',
];

/** A quote for this visit; `random` is there for the tests. */
export function pickQuote(random: () => number = Math.random): string {
  return QUOTES[Math.min(QUOTES.length - 1, Math.floor(random() * QUOTES.length))];
}
