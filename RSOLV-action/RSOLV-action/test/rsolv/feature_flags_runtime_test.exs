defmodule Rsolv.FeatureFlagsRuntimeTest do
  use ExUnit.Case, async: false
  alias Rsolv.FeatureFlags
  
  setup do
    # Skip these tests if FunWithFlags is not properly configured
    if Application.get_env(:fun_with_flags, :persistence) == nil do
      :skip
    else
      :ok
    end
  end

  describe "runtime configuration compatibility" do
    @tag :skip
    test "admin_emails uses runtime configuration, not compile-time" do
      # This test verifies that the FeatureFlags module correctly
      # identifies admins based on runtime configuration
      
      # Store original config
      original_admin_emails = Application.get_env(:rsolv, :admin_emails)
      
      # Set a test admin email
      test_admin = "test-runtime@example.com"
      Application.put_env(:rsolv, :admin_emails, [test_admin])
      
      # Test that the runtime config is used
      # The FeatureFlags.enabled? function should check if the email is in admin_emails
      result = FeatureFlags.enabled?(:admin_dashboard, email: test_admin)
      
      # Should be true because test_admin is now in the admin_emails config
      assert result == true
      
      # Test with non-admin email
      non_admin_result = FeatureFlags.enabled?(:admin_dashboard, email: "regular@example.com")
      assert non_admin_result == false
      
      # Cleanup
      if original_admin_emails do
        Application.put_env(:rsolv, :admin_emails, original_admin_emails)
      else
        Application.delete_env(:rsolv, :admin_emails)
      end
    end
    
    @tag :skip
    test "admin role determination uses runtime admin_emails" do
      # Store original config
      original_admin_emails = Application.get_env(:rsolv, :admin_emails)
      
      
      # Set test admin emails
      test_admins = ["runtime-admin@example.com", "another-admin@example.com"]
      Application.put_env(:rsolv, :admin_emails, test_admins)
      
      # Test admin role determination
      admin_user = %{email: "runtime-admin@example.com", tags: []}
      regular_user = %{email: "regular@example.com", tags: []}
      
      # These should work with runtime configuration
      assert FeatureFlags.for_role(:admin) |> Enum.member?(:admin_dashboard)
      assert FeatureFlags.enabled?(:admin_dashboard, user: admin_user)
      refute FeatureFlags.enabled?(:admin_dashboard, user: regular_user)
      
      # Cleanup
      if original_admin_emails do
        Application.put_env(:rsolv, :admin_emails, original_admin_emails)
      else
        Application.delete_env(:rsolv, :admin_emails)
      end
    end
  end
end