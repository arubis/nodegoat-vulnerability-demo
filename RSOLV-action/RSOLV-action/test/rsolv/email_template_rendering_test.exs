defmodule Rsolv.EmailTemplateRenderingTest do
  use ExUnit.Case, async: true
  alias Rsolv.Emails

  describe "email template rendering" do
    test "renders setup_verification template correctly" do
      email = Emails.setup_verification_email("test@example.com", "TestUser")
      
      # The email should have the correct subject
      assert email.subject == "Verify Your RSOLV Setup - Need Any Help?"
      
      # The HTML body should contain setup verification content, not fallback
      assert email.html_body =~ "Let's Verify Your RSOLV Setup"
      assert email.html_body =~ "TestUser"
      assert email.html_body =~ "Quick Setup Checklist"
      assert email.html_body =~ "rsolv:automate"
      
      # Should NOT contain the fallback welcome content
      refute email.html_body =~ "Thanks for trying RSOLV! You're just a few minutes away"
      
      # The text body should be the custom text version
      assert email.text_body =~ "Let's Verify Your RSOLV Setup"
      assert email.text_body =~ "Quick Setup Checklist:"
    end

    test "renders feature_deep_dive template correctly" do
      email = Emails.feature_deep_dive_email("test@example.com", "TestUser")
      
      assert email.subject == "Advanced RSOLV Features You Might Have Missed"
      
      # Should contain feature deep dive content
      assert email.html_body =~ "Unlock the Full Power of RSOLV"
      assert email.html_body =~ "Understanding RSOLV's Proactive Scanning"
      assert email.html_body =~ "Security"
      assert email.html_body =~ "advanced features"
      
      # Should NOT contain welcome fallback
      refute email.html_body =~ "Thanks for trying RSOLV! You're just a few minutes away"
    end

    test "renders feedback_request template correctly" do
      email = Emails.feedback_request_email("test@example.com", "TestUser")
      
      assert email.subject == "How's Your Experience with RSOLV?"
      
      # Should contain feedback request content
      assert email.html_body =~ "Quick Check-In: How's RSOLV Working for You?"
      assert email.html_body =~ "How likely are you to recommend RSOLV"
      assert email.html_body =~ "Three Quick Questions"
      assert email.html_body =~ "Dylan & The RSOLV Team"
      
      # Should NOT contain welcome fallback
      refute email.html_body =~ "Thanks for trying RSOLV! You're just a few minutes away"
    end

    test "renders success_checkin template correctly with usage stats" do
      usage_stats = %{
        issues_fixed: 25,
        prs_created: 30,
        time_saved: "75 hours",
        security_fixes: 12,
        fixes_deployed: 20
      }
      
      email = Emails.success_checkin_email("test@example.com", "TestUser", usage_stats)
      
      assert email.subject == "Your RSOLV Success Report"
      
      # Should contain success report content
      assert email.html_body =~ "Your 2-Week RSOLV Success Report"
      assert email.html_body =~ "Issues Fixed"
      assert email.html_body =~ "25"
      assert email.html_body =~ "PRs Created" 
      assert email.html_body =~ "30"
      assert email.html_body =~ "Time Saved"
      assert email.html_body =~ "75 hours"
      assert email.html_body =~ "Security Issues Found"
      assert email.html_body =~ "12"
      
      # Should show power user achievement (25 issues >= 5)
      assert email.html_body =~ "Power User Achievement Unlocked!"
      
      # Should NOT contain welcome fallback
      refute email.html_body =~ "Thanks for trying RSOLV! You're just a few minutes away"
    end

    test "renders early_access_guide template correctly" do
      email = Emails.early_access_guide_email("test@example.com", "TestUser")
      
      # Should render the early access guide template
      assert email.html_body =~ "Your RSOLV Early Access Guide"
      assert email.html_body =~ "How RSOLV Works"
      assert email.html_body =~ "How to Write Effective Issues"
      
      # Should NOT contain welcome fallback
      refute email.html_body =~ "Thanks for trying RSOLV! You're just a few minutes away"
    end
  end
end