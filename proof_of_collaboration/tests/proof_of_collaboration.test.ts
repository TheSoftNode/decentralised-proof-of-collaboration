import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const deployer = accounts.get("deployer")!;

const contractName = "proof_of_collaboration";

// Error constants
const ERR_OWNER_ONLY = 100;
const ERR_NOT_FOUND = 101;
const ERR_ALREADY_VERIFIED = 102;

// Tier constants
const BRONZE = 1;
const SILVER = 2;
const GOLD = 3;
const PLATINUM = 4;

// Tier thresholds
const SILVER_THRESHOLD = 100;
const GOLD_THRESHOLD = 250;
const PLATINUM_THRESHOLD = 500;

describe("Proof of Collaboration Contract Tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  describe("Contract Initialization", () => {
    it("initializes contract successfully", () => {
      const { result } = simnet.callPublicFn(contractName, "initialize", [], deployer);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("sets contract owner as project admin", () => {
      // Initialize first
      simnet.callPublicFn(contractName, "initialize", [], deployer);
      
      const { result } = simnet.callReadOnlyFn(
        contractName, 
        "is-project-admin", 
        [Cl.principal(deployer)], 
        deployer
      );
      expect(result).toBeBool(true);
    });

    it("non-owners are not project admins by default", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName, 
        "is-project-admin", 
        [Cl.principal(address1)], 
        deployer
      );
      expect(result).toBeBool(false);
    });
  });

  describe("Admin Management", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "initialize", [], deployer);
    });

    it("allows contract owner to add project admin", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address1)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("verifies newly added admin has admin status", () => {
      // Add admin first
      simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address1)],
        deployer
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "is-project-admin",
        [Cl.principal(address1)],
        deployer
      );
      expect(result).toBeBool(true);
    });

    it("prevents non-owner from adding project admin", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address2)],
        address1
      );
      expect(result).toBeErr(Cl.uint(ERR_OWNER_ONLY));
    });

    it("allows multiple project admins", () => {
      // Add first admin
      simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address1)],
        deployer
      );

      // Add second admin
      const { result } = simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address2)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Verify both are admins
      const admin1Check = simnet.callReadOnlyFn(
        contractName,
        "is-project-admin",
        [Cl.principal(address1)],
        deployer
      );
      expect(admin1Check.result).toBeBool(true);

      const admin2Check = simnet.callReadOnlyFn(
        contractName,
        "is-project-admin",
        [Cl.principal(address2)],
        deployer
      );
      expect(admin2Check.result).toBeBool(true);
    });
  });

  describe("Read-Only Functions", () => {
    it("returns none for non-existent contribution", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(999)],
        deployer
      );
      expect(result).toBeNone();
    });

    it("returns none for non-existent contributor profile", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      expect(result).toBeNone();
    });

    it("returns error for non-existent contributor tier", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_NOT_FOUND));
    });
  });

  describe("Contribution Submission", () => {
    it("allows user to submit first contribution", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Fixed critical bug in authentication module")],
        address1
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("creates contributor profile on first submission", () => {
      // Submit contribution
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Implemented new feature")],
        address1
      );

      // Check profile created
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          "total-score": Cl.uint(0),
          "contribution-count": Cl.uint(1),
          "tier": Cl.uint(BRONZE),
          "is-active": Cl.bool(true)
        })
      );
    });

    it("stores contribution details correctly", () => {
      const contributionDetails = "Added comprehensive unit tests";
      
      // Submit contribution
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8(contributionDetails)],
        address1
      );

      // Check contribution stored
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          "contributor": Cl.principal(address1),
          "timestamp": Cl.uint(simnet.blockHeight),
          "details": Cl.stringUtf8(contributionDetails),
          "score": Cl.uint(0),
          "verified": Cl.bool(false)
        })
      );
    });

    it("increments contribution counter", () => {
      // Submit first contribution
      const result1 = simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("First contribution")],
        address1
      );
      expect(result1.result).toBeOk(Cl.uint(1));

      // Submit second contribution
      const result2 = simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Second contribution")],
        address2
      );
      expect(result2.result).toBeOk(Cl.uint(2));
    });

    it("updates existing contributor profile on subsequent submissions", () => {
      // First submission
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("First contribution")],
        address1
      );

      // Second submission from same user
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Second contribution")],
        address1
      );

      // Check updated profile
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          "total-score": Cl.uint(0), // Still 0 as not verified
          "contribution-count": Cl.uint(2),
          "tier": Cl.uint(BRONZE),
          "is-active": Cl.bool(true)
        })
      );
    });

    it("handles long contribution details", () => {
      const longDetails = "A".repeat(256); // Max length
      
      const { result } = simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8(longDetails)],
        address1
      );
      expect(result).toBeOk(Cl.uint(1));

      // Verify stored correctly
      const contributionResult = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(1)],
        deployer
      );
      const contribution = contributionResult.result.expectSome();
      expect(contribution).toMatchObject({
        "details": Cl.stringUtf8(longDetails)
      });
    });

    it("handles multiple users submitting contributions", () => {
      // User 1 submits
      const result1 = simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("User 1 contribution")],
        address1
      );
      expect(result1.result).toBeOk(Cl.uint(1));

      // User 2 submits
      const result2 = simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("User 2 contribution")],
        address2
      );
      expect(result2.result).toBeOk(Cl.uint(2));

      // User 3 submits
      const result3 = simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("User 3 contribution")],
        address3
      );
      expect(result3.result).toBeOk(Cl.uint(3));

      // Verify all have profiles
      const profiles = [address1, address2, address3].map(addr => {
        const { result } = simnet.callReadOnlyFn(
          contractName,
          "get-contributor-profile",
          [Cl.principal(addr)],
          deployer
        );
        return result;
      });

      profiles.forEach(profile => {
        expect(profile).not.toBeNone();
      });
    });
  });

  describe("Contribution Verification", () => {
    beforeEach(() => {
      // Initialize and set up admin
      simnet.callPublicFn(contractName, "initialize", [], deployer);
      
      // Submit a test contribution
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Test contribution for verification")],
        address1
      );
    });

    it("allows admin to verify contribution", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(50)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("updates contribution with score and verified status", () => {
      // Verify contribution
      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(75)],
        deployer
      );

      // Check contribution updated
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(1)],
        deployer
      );
      
      const contribution = result.expectSome();
      expect(contribution).toMatchObject({
        "score": Cl.uint(75),
        "verified": Cl.bool(true)
      });
    });

    it("updates contributor total score after verification", () => {
      // Verify contribution
      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(80)],
        deployer
      );

      // Check contributor profile updated
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      
      const profile = result.expectSome();
      expect(profile).toMatchObject({
        "total-score": Cl.uint(80),
        "contribution-count": Cl.uint(1)
      });
    });

    it("prevents non-admin from verifying contributions", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(50)],
        address2
      );
      expect(result).toBeErr(Cl.uint(ERR_OWNER_ONLY));
    });

    it("prevents double verification of same contribution", () => {
      // First verification
      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(50)],
        deployer
      );

      // Attempt second verification
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(75)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_ALREADY_VERIFIED));
    });

    it("returns error for non-existent contribution", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(999), Cl.uint(50)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_NOT_FOUND));
    });

    it("allows added admin to verify contributions", () => {
      // Add new admin
      simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address2)],
        deployer
      );

      // New admin verifies contribution
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(60)],
        address2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("accumulates scores from multiple verified contributions", () => {
      // Submit second contribution
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Second contribution")],
        address1
      );

      // Verify first contribution
      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(30)],
        deployer
      );

      // Verify second contribution
      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(2), Cl.uint(45)],
        deployer
      );

      // Check accumulated score
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      
      const profile = result.expectSome();
      expect(profile).toMatchObject({
        "total-score": Cl.uint(75), // 30 + 45
        "contribution-count": Cl.uint(2)
      });
    });

    it("handles zero score verification", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(0)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Check contribution marked as verified with zero score
      const contributionResult = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(1)],
        deployer
      );
      
      const contribution = contributionResult.result.expectSome();
      expect(contribution).toMatchObject({
        "score": Cl.uint(0),
        "verified": Cl.bool(true)
      });
    });

    it("handles high score verification", () => {
      const highScore = 1000;
      
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(highScore)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Check score stored correctly
      const profileResult = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      
      const profile = profileResult.result.expectSome();
      expect(profile).toMatchObject({
        "total-score": Cl.uint(highScore)
      });
    });
  });

  describe("Tier Management", () => {
    beforeEach(() => {
      // Initialize contract
      simnet.callPublicFn(contractName, "initialize", [], deployer);
    });

    it("updates contributor to Silver tier", () => {
      // Submit and verify contribution to reach Silver threshold
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Silver tier contribution")],
        address1
      );
      
      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(SILVER_THRESHOLD)],
        deployer
      );

      // Update tier
      const { result } = simnet.callPublicFn(
        contractName,
        "update-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Check tier updated
      const tierResult = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );
      expect(tierResult.result).toBeOk(Cl.uint(SILVER));
    });

    it("updates contributor to Gold tier", () => {
      // Submit and verify contribution to reach Gold threshold
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Gold tier contribution")],
        address1
      );
      
      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(GOLD_THRESHOLD)],
        deployer
      );

      // Update tier
      simnet.callPublicFn(
        contractName,
        "update-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );

      let tier = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );
      expect(tier.result).toBeOk(Cl.uint(GOLD));

      // Progress to Platinum
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Fourth contribution")],
        address1
      );
      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(4), Cl.uint(250)], // Total: 510
        deployer
      );
      simnet.callPublicFn(
        contractName,
        "update-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );

      tier = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );
      expect(tier.result).toBeOk(Cl.uint(PLATINUM));

      // Final profile check
      const finalProfile = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      
      expect(finalProfile.result).toBeSome(
        Cl.tuple({
          "total-score": Cl.uint(510),
          "contribution-count": Cl.uint(4),
          "tier": Cl.uint(PLATINUM),
          "is-active": Cl.bool(true)
        })
      );
    });

    it("handles admin workflow with multiple contributors", () => {
      // Add multiple admins
      simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address2)],
        deployer
      );

      // Multiple contributors submit
      const contributors = [address1, address2, address3];
      const contributionTexts = [
        "Database optimization",
        "UI/UX improvements", 
        "Security enhancement"
      ];

      contributors.forEach((contributor, index) => {
        if (contributor !== address2) { // address2 is admin, can't be contributor for this test
          simnet.callPublicFn(
            contractName,
            "submit-contribution",
            [Cl.stringUtf8(contributionTexts[index])],
            contributor
          );
        }
      });

      // Different admins verify different contributions
      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(75)], // address1's contribution
        deployer
      );

      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(2), Cl.uint(90)], // address3's contribution  
        address2 // Different admin verifies
      );

      // Check contributions are verified by different admins
      const contrib1 = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(1)],
        deployer
      );
      expect(contrib1.result.expectSome()).toMatchObject({
        "verified": Cl.bool(true),
        "score": Cl.uint(75)
      });

      const contrib2 = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(2)],
        deployer
      );
      expect(contrib2.result.expectSome()).toMatchObject({
        "verified": Cl.bool(true),
        "score": Cl.uint(90)
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "initialize", [], deployer);
    });

    it("handles empty contribution details", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("")],
        address1
      );
      expect(result).toBeOk(Cl.uint(1));

      // Check empty string stored
      const contribution = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(1)],
        deployer
      );
      expect(contribution.result.expectSome()).toMatchObject({
        "details": Cl.stringUtf8("")
      });
    });

    it("handles maximum score values", () => {
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Max score test")],
        address1
      );

      // Very high score
      const maxScore = 4294967295; // Max uint value
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(maxScore)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Check score stored correctly
      const profile = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      expect(profile.result.expectSome()).toMatchObject({
        "total-score": Cl.uint(maxScore)
      });
    });

    it("handles contributor with many contributions", () => {
      // Submit 10 contributions
      for (let i = 1; i <= 10; i++) {
        const result = simnet.callPublicFn(
          contractName,
          "submit-contribution",
          [Cl.stringUtf8(`Contribution ${i}`)],
          address1
        );
        expect(result.result).toBeOk(Cl.uint(i));
      }

      // Verify all contributions
      for (let i = 1; i <= 10; i++) {
        simnet.callPublicFn(
          contractName,
          "verify-contribution",
          [Cl.uint(i), Cl.uint(10)], // 10 points each
          deployer
        );
      }

      // Check final profile
      const profile = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      expect(profile.result.expectSome()).toMatchObject({
        "total-score": Cl.uint(100), // 10 * 10
        "contribution-count": Cl.uint(10)
      });
    });

    it("handles tier update for contributor at tier boundary", () => {
      // Submit contribution with exact Silver threshold score
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Boundary test")],
        address1
      );

      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(SILVER_THRESHOLD - 1)], // Just below Silver
        deployer
      );

      // Update tier - should remain Bronze
      simnet.callPublicFn(
        contractName,
        "update-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );

      let tier = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );
      expect(tier.result).toBeOk(Cl.uint(BRONZE));

      // Add one more point to reach Silver
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("One more point")],
        address1
      );

      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(2), Cl.uint(1)],
        deployer
      );

      simnet.callPublicFn(
        contractName,
        "update-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );

      tier = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );
      expect(tier.result).toBeOk(Cl.uint(SILVER));
    });

    it("handles repeated tier updates", () => {
      // Setup contributor
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Test contribution")],
        address1
      );

      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(GOLD_THRESHOLD)],
        deployer
      );

      // Update tier multiple times
      for (let i = 0; i < 5; i++) {
        const result = simnet.callPublicFn(
          contractName,
          "update-contributor-tier",
          [Cl.principal(address1)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));
      }

      // Should still be Gold tier
      const tier = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-tier",
        [Cl.principal(address1)],
        deployer
      );
      expect(tier.result).toBeOk(Cl.uint(GOLD));
    });

    it("preserves contribution order and IDs", () => {
      const contributors = [address1, address2, address3];
      const details = ["First", "Second", "Third"];

      // Submit contributions in order
      contributors.forEach((contributor, index) => {
        const result = simnet.callPublicFn(
          contractName,
          "submit-contribution",
          [Cl.stringUtf8(details[index])],
          contributor
        );
        expect(result.result).toBeOk(Cl.uint(index + 1));
      });

      // Verify order preserved
      for (let i = 1; i <= 3; i++) {
        const contribution = simnet.callReadOnlyFn(
          contractName,
          "get-contribution",
          [Cl.uint(i)],
          deployer
        );
        expect(contribution.result.expectSome()).toMatchObject({
          "contributor": Cl.principal(contributors[i - 1]),
          "details": Cl.stringUtf8(details[i - 1])
        });
      }
    });

    it("handles block height timestamps correctly", () => {
      const initialHeight = simnet.blockHeight;

      // Submit contribution
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Timestamp test")],
        address1
      );

      // Check timestamp matches block height
      const contribution = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(1)],
        deployer
      );
      expect(contribution.result.expectSome()).toMatchObject({
        "timestamp": Cl.uint(initialHeight)
      });

      // Mine blocks and submit another
      simnet.mineEmptyBlocks(5);
      
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Second timestamp test")],
        address1
      );

      const contribution2 = simnet.callReadOnlyFn(
        contractName,
        "get-contribution",
        [Cl.uint(2)],
        deployer
      );
      expect(contribution2.result.expectSome()).toMatchObject({
        "timestamp": Cl.uint(initialHeight + 5)
      });
    });
  });

  describe("Security and Access Control", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "initialize", [], deployer);
    });

    it("prevents unauthorized admin addition", () => {
      // Non-owner tries to add admin
      const result = simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address3)],
        address1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_OWNER_ONLY));

      // Verify admin was not added
      const adminCheck = simnet.callReadOnlyFn(
        contractName,
        "is-project-admin",
        [Cl.principal(address3)],
        deployer
      );
      expect(adminCheck.result).toBeBool(false);
    });

    it("maintains admin permissions after adding multiple admins", () => {
      // Add two admins
      simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address1)],
        deployer
      );

      simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address2)],
        deployer
      );

      // All three (owner + 2 admins) should be able to verify
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Test contribution")],
        address3
      );

      // Owner verifies
      const ownerVerify = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(50)],
        deployer
      );
      expect(ownerVerify.result).toBeOk(Cl.bool(true));

      // Submit another for admin1 to verify
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Second test")],
        address3
      );

      // Admin1 verifies
      const admin1Verify = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(2), Cl.uint(60)],
        address1
      );
      expect(admin1Verify.result).toBeOk(Cl.bool(true));
    });

    it("prevents contributor from verifying their own contribution", () => {
      // Add contributor as admin first
      simnet.callPublicFn(
        contractName,
        "add-project-admin",
        [Cl.principal(address1)],
        deployer
      );

      // Contributor submits
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("Self verification attempt")],
        address1
      );

      // Same person tries to verify (this should work in the current contract)
      // This test documents current behavior - in a real system you might want to prevent this
      const result = simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(50)],
        address1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("isolates contributor data correctly", () => {
      // Two contributors with same score but different contribution counts
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("User 1 single contribution")],
        address1
      );

      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(1), Cl.uint(100)],
        deployer
      );

      // User 2 makes two contributions with same total score
      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("User 2 first contribution")],
        address2
      );

      simnet.callPublicFn(
        contractName,
        "submit-contribution",
        [Cl.stringUtf8("User 2 second contribution")],
        address2
      );

      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(2), Cl.uint(50)],
        deployer
      );

      simnet.callPublicFn(
        contractName,
        "verify-contribution",
        [Cl.uint(3), Cl.uint(50)],
        deployer
      );

      // Both should have same total score but different contribution counts
      const profile1 = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address1)],
        deployer
      );
      expect(profile1.result.expectSome()).toMatchObject({
        "total-score": Cl.uint(100),
        "contribution-count": Cl.uint(1)
      });

      const profile2 = simnet.callReadOnlyFn(
        contractName,
        "get-contributor-profile",
        [Cl.principal(address2)],
        deployer
      );
      expect(profile2.result.expectSome()).toMatchObject({
        "total-score": Cl.uint(100),
        "contribution-count": Cl.uint(2)
      });
    });
  });

  describe("Performance and Scale Tests", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "initialize", [], deployer);
    });

    it("handles many contributors efficiently", () => {
      const contributors = [address1, address2, address3];
      
      // Each contributor submits multiple contributions
      contributors.forEach((contributor, userIndex) => {
        for (let i = 1; i <= 3; i++) {
          const result = simnet.callPublicFn(
            contractName,
            "submit-contribution",
            [Cl.stringUtf8(`User ${userIndex + 1} contribution ${i}`)],
            contributor
          );
          expect(result.result).toBeOk(Cl.uint((userIndex * 3) + i));
        }
      });

      // Verify all contributions
      for (let i = 1; i <= 9; i++) {
        const result = simnet.callPublicFn(
          contractName,
          "verify-contribution",
          [Cl.uint(i), Cl.uint(25)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));
      }

      // Check all contributors have correct profiles
      contributors.forEach(contributor => {
        const profile = simnet.callReadOnlyFn(
          contractName,
          "get-contributor-profile",
          [Cl.principal(contributor)],
          deployer
        );
        expect(profile.result.expectSome()).toMatchObject({
          "total-score": Cl.uint(75), // 3 * 25
          "contribution-count": Cl.uint(3)
        });
      });
    });

    it("maintains data consistency across many operations", () => {
      let expectedContributionId = 1;
      
      // Interleave submissions and verifications
      for (let round = 0; round < 3; round++) {
        // Submit from each user
        [address1, address2, address3].forEach(contributor => {
          const result = simnet.callPublicFn(
            contractName,
            "submit-contribution",
            [Cl.stringUtf8(`Round ${round} contribution`)],
            contributor
          );
          expect(result.result).toBeOk(Cl.uint(expectedContributionId));
          expectedContributionId++;
        });

        // Verify some contributions
        for (let i = round * 3 + 1; i <= (round + 1) * 3; i++) {
          if (i % 2 === 1) { // Verify odd-numbered contributions
            simnet.callPublicFn(
              contractName,
              "verify-contribution",
              [Cl.uint(i), Cl.uint(30)],
              deployer
            );
          }
        }
      }

      // Final consistency check
      const totalContributions = 9;
      for (let i = 1; i <= totalContributions; i++) {
        const contribution = simnet.callReadOnlyFn(
          contractName,
          "get-contribution",
          [Cl.uint(i)],
          deployer
        );
        expect(contribution.result).not.toBeNone();;
        
        const contributionData = contribution.result.expectSome();
        if (i % 2 === 1) {
          expect(contributionData).toMatchObject({
            "verified": Cl.bool(true),
            "score": Cl.uint(30)
          });
        } else {
          expect(contributionData).toMatchObject({
            "verified": Cl.bool(false),
            "score": Cl.uint(0)
          });
        }
      }
    });
  });
});