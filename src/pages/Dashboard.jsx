import { account } from "../lib/appwrite";
import { getWallet, updateBalance } from "../lib/wallet";
import { findMatch } from "../lib/matchmaking";

export default function Dashboard({ goMatch, goWallet, logout }) {
  async function start(stake) {
    const user = await account.get();
    const wallet = await getWallet(user.$id);

    if (wallet.balance < stake) {
      alert("Insufficient balance");
      return;
    }

    // deduct
    await updateBalance(wallet.$id, wallet.balance - stake);

    const matchId = await findMatch(user.$id, stake);

    goMatch(matchId, stake);
  }

  return (
    <div>
      <h1>Dashboard</h1>

      <button onClick={() => start(10)}>Play ₦10</button>
      <button onClick={() => start(50)}>Play ₦50</button>

      <button onClick={goWallet}>Wallet</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}