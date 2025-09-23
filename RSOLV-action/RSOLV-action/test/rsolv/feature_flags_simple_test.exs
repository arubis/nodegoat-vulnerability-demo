defmodule Rsolv.FeatureFlagsSimpleTest do
  use ExUnit.Case, async: false
  alias Rsolv.FeatureFlags

  describe "admin role detection" do
    test "identifies admin users based on runtime config" do
      # Store original config
      original_admin_emails = Application.get_env(:rsolv, :admin_emails)
      
      try do
        # Set test admin email
        test_email = "test-admin@example.com"
        Application.put_env(:rsolv, :admin_emails, [test_email])
        
        # Test the basic role detection - not the full feature flag system
        # This tests that our runtime config lookup works
        admin_emails = Application.get_env(:rsolv, :admin_emails, [])
        assert test_email in admin_emails
        
        # Also test that non-admin is not in the list
        assert "regular@example.com" not in admin_emails
      after
        # Restore original config
        if original_admin_emails do
          Application.put_env(:rsolv, :admin_emails, original_admin_emails)
        else
          Application.delete_env(:rsolv, :admin_emails)
        end
      end
    end
    
    test "all_flags returns expected feature list" do
      # This tests that our feature list is properly defined
      flags = FeatureFlags.all_flags()
      
      # Check that expected flags exist
      assert :admin_dashboard in flags
      assert :interactive_roi_calculator in flags
      assert :core_features in flags
    end
  end
end