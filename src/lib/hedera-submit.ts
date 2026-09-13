import "server-only";

import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import type { HederaRuntimeConfig } from "./hedera-config";
import type { HederaSubmitResult } from "./hedera-attest";

function parseOperatorKey(value: string): PrivateKey {
  const trimmed = value.trim();
  try {
    return PrivateKey.fromString(trimmed);
  } catch {
    throw new Error(
      "Hedera operator key could not be parsed. Use the Testnet private key (DER or hex). Never a seed phrase.",
    );
  }
}

export async function submitHcsAttestation(
  config: HederaRuntimeConfig,
  input: { topicId: string | null; message: string },
): Promise<HederaSubmitResult> {
  if (config.network !== "testnet") {
    throw new Error("Phase 0.5 is Hedera Testnet only.");
  }
  if (!config.operatorKey) {
    throw new Error("HEDERA_OPERATOR_KEY is required for a live Testnet submit.");
  }

  const client = Client.forTestnet();
  try {
    client.setOperator(
      AccountId.fromString(config.operatorId),
      parseOperatorKey(config.operatorKey),
    );

    let topicId = input.topicId;
    let topicCreated = false;
    if (!topicId) {
      const createTx = await new TopicCreateTransaction()
        .setTopicMemo("Resonance Phase 0.5 decision attestations")
        .execute(client);
      const createReceipt = await createTx.getReceipt(client);
      const created = createReceipt.topicId;
      if (!created) {
        throw new Error("Hedera topic create did not return a topic id.");
      }
      topicId = created.toString();
      topicCreated = true;
    }

    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(input.message)
      .execute(client);
    const submitReceipt = await submitTx.getReceipt(client);
    const sequence = submitReceipt.topicSequenceNumber;
    const transactionId = submitTx.transactionId.toString();
    const messageId =
      sequence != null ? `${topicId}/${sequence.toString()}` : transactionId;

    return {
      topicId,
      topicCreated,
      messageId,
      transactionId,
    };
  } finally {
    client.close();
  }
}
