defmodule Rsolv.FeatureFlagsTest do
  use Rsolv.DataCase, async: false
  
  alias Rsolv.FeatureFlags
  
  setup do
    # Ensure the interactive_roi_calculator is enabled for tests
    FeatureFlags.enable(:interactive_roi_calculator)
    
    on_exit(fn ->
      # Clean up by disabling it after test if needed
      # We can leave it enabled since it should be enabled by default anyway
    end)
    
    :ok
  end
  
  # Tests the base functionality without configuration
  describe "basic functionality" do
    test "returns false for unknown feature flags" do
      # With FunWithFlags integration, unknown features return false
      refute FeatureFlags.enabled?(:nonexistent_feature)
    end
    
    test "returns default values for standard features" do
      assert FeatureFlags.enabled?(:interactive_roi_calculator)
      assert FeatureFlags.enabled?(:team_size_field)
      assert FeatureFlags.enabled?(:feedback_form)
      assert FeatureFlags.enabled?(:early_access_signup)
      assert FeatureFlags.enabled?(:welcome_email_sequence)
      
      refute FeatureFlags.enabled?(:admin_dashboard)
      refute FeatureFlags.enabled?(:metrics_dashboard)
      refute FeatureFlags.enabled?(:feedback_dashboard)
    end
    
    test "for_role/1 returns correct features for each role" do
      # Admin should have access to more features than early access
      admin_features = FeatureFlags.for_role(:admin)
      early_access_features = FeatureFlags.for_role(:early_access)
      
      assert length(admin_features) > length(early_access_features)
      assert :admin_dashboard in admin_features
      refute :admin_dashboard in early_access_features
    end
    
    test "for_user/1 handles nil or invalid user gracefully" do
      features = FeatureFlags.for_user(nil)
      assert is_list(features)
      
      features = FeatureFlags.for_user(%{name: "No Email"})
      assert is_list(features)
    end
  end
end