import arcjet, {
  detectBot,
  fixedWindow,
  protectSignup,
  sensitiveInfo,
  shield,
  slidingWindow,
} from "@arcjet/next";
import { env } from "./env";

export {
  detectBot,
  fixedWindow,
  protectSignup,
  sensitiveInfo,
  shield,
  slidingWindow,
};

export const aj = arcjet({
  key: env.ARCJET_KEY,
  characteristics: ["fingerprint"],
  // Define base rules here, can also be empty if you don't want to have any base rules
  rules: [
    shield({
        mode: "LIVE"
    })
  ],
});
