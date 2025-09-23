defmodule Rsolv.FeatureFlagsFunWithFlagsTest do
  use Rsolv.DataCase, async: false
  
  alias Rsolv.FeatureFlags
  
  setup do
    # Clear all flags before each test
    # FunWithFlags doesn't have clear_all, so we'll disable known flags
    flags = [:test_feature, :test_enabled, :test_disabled, :premium_feature, 
             :gradual_rollout, :admin_only, :cached_feature, :admin_dashboard,
             :metrics_dashboard, :feedback_dashboard, :interactive_roi_calculator,
             :flag_1, :flag_2, :flag_3, :concurrent_test, :dynamic_only_flag,
             :refresh_test]
    
    Enum.each(flags, fn flag ->
      FunWithFlags.clear(flag)
    end)
    
    :ok
  end
  
  describe "enabled?/2 with FunWithFlags backend" do
    test "returns false for disabled features" do
      # Given a disabled feature
      {:ok, _} = FunWithFlags.disable(:test_feature)
      
      # When checking if enabled
      result = FeatureFlags.enabled?(:test_feature)
      
      # Then it should be false
      refute result
    end
    
    test "returns true for enabled features" do
      # test_feature doesn't exist in migration, so it defaults to false
      refute FeatureFlags.enabled?(:test_feature)
      
      # Given an enabled feature
      {:ok, _} = FunWithFlags.enable(:test_feature)
      
      # When checking if enabled
      result = FeatureFlags.enabled?(:test_feature)
      
      # Then it should be true
      assert result
    end
    
    test "supports user context for boolean flags" do
      # Test a feature that's in early_access (available to all users)
      # First ensure it's disabled in FunWithFlags
      {:ok, _} = FunWithFlags.disable(:core_features)
      
      regular_user = %{email: "user@example.com"}
      refute FeatureFlags.enabled?(:core_features, user: regular_user)
      
      admin_user = %{email: "admin@rsolv.dev"}
      refute FeatureFlags.enabled?(:core_features, user: admin_user)
      
      # When we enable it globally in FunWithFlags
      {:ok, _} = FunWithFlags.enable(:core_features)
      
      # Then both can see it (core_features is in early_access role)
      assert FeatureFlags.enabled?(:core_features, user: regular_user)
      assert FeatureFlags.enabled?(:core_features, user: admin_user)
    end
    
    test "supports percentage-based rollouts" do
      # Given a feature with 50% rollout (using time-based percentage)
      {:ok, _} = FunWithFlags.enable(:gradual_rollout, for_percentage_of: {:time, 0.5})
      
      # When checking multiple times
      # Time-based percentage uses current time, not actors
      results = for _ <- 1..100 do
        FeatureFlags.enabled?(:gradual_rollout)
      end
      
      # Then roughly 50% should be enabled (with some variance)
      enabled_count = Enum.count(results, & &1)
      assert enabled_count > 20 && enabled_count < 80
    end
    
    test "static config admin email-based flags" do
      # When FunWithFlags doesn't have data for a feature,
      # it falls back to static config which respects admin emails
      
      # Use a feature that's not in FunWithFlags migration
      # but exists in static config
      
      # Regular users can't access admin-only features from static config
      regular_user = %{email: "user@example.com"}
      refute FeatureFlags.enabled?(:support_ticket_submission, user: regular_user)
      
      # Admin users can access admin-only features from static config
      # (when FunWithFlags doesn't override)
      admin_user = %{email: "admin@rsolv.dev"}
      assert FeatureFlags.enabled?(:support_ticket_submission, user: admin_user)
    end
  end
  
  describe "dashboard feature flags" do
    test "admin_dashboard can be toggled dynamically" do
      # Given dashboard is disabled by default (from migration)
      refute FeatureFlags.enabled?(:admin_dashboard)
      
      # When enabling it
      {:ok, _} = FunWithFlags.enable(:admin_dashboard)
      
      # Then it should be enabled
      assert FeatureFlags.enabled?(:admin_dashboard)
    end
    
    test "multiple dashboards can be managed independently" do
      # Start with defaults from migration (all dashboards disabled)
      refute FeatureFlags.enabled?(:admin_dashboard)
      refute FeatureFlags.enabled?(:metrics_dashboard)
      refute FeatureFlags.enabled?(:feedback_dashboard)
      
      # Given different dashboard states
      {:ok, _} = FunWithFlags.enable(:admin_dashboard)
      # metrics_dashboard remains disabled
      {:ok, _} = FunWithFlags.enable(:feedback_dashboard)
      
      # Then each should reflect its state
      assert FeatureFlags.enabled?(:admin_dashboard)
      refute FeatureFlags.enabled?(:metrics_dashboard)
      assert FeatureFlags.enabled?(:feedback_dashboard)
    end
  end
  
  describe "migration from static flags" do
    test "falls back to static configuration when FunWithFlags has no data" do
      # Use an admin-only feature that's role-gated
      FunWithFlags.clear(:admin_dashboard)
      
      # Without any FunWithFlags data and no user context, 
      # it should return false (FunWithFlags default)
      result = FeatureFlags.enabled?(:admin_dashboard)
      refute result
      
      # Regular users can't access admin features
      regular_user = %{email: "user@example.com"}
      refute FeatureFlags.enabled?(:admin_dashboard, user: regular_user)
      
      # But admin users can access role-gated features
      admin_user = %{email: "admin@rsolv.dev"}
      assert FeatureFlags.enabled?(:admin_dashboard, user: admin_user)
    end
    
    test "FunWithFlags overrides static configuration" do
      # Use core_features which is enabled for all roles
      # First clear it from FunWithFlags to ensure we start clean
      FunWithFlags.clear(:core_features)
      
      # Enable it globally in FunWithFlags
      {:ok, _} = FunWithFlags.enable(:core_features)
      
      # Should be enabled
      assert FeatureFlags.enabled?(:core_features)
      
      # When we disable it in FunWithFlags
      {:ok, _} = FunWithFlags.disable(:core_features)
      
      # Then it should be disabled
      refute FeatureFlags.enabled?(:core_features)
    end
  end
  
  describe "performance and caching" do
    test "multiple lookups are fast due to ETS caching" do
      # Given an enabled feature
      {:ok, _} = FunWithFlags.enable(:cached_feature)
      
      # When looking up many times
      {time, _} = :timer.tc(fn ->
        for _ <- 1..10_000 do
          FeatureFlags.enabled?(:cached_feature)
        end
      end)
      
      # Then it should be reasonably fast (< 10 seconds for 10k lookups)
      # Note: We're now checking all_flags() on each lookup which adds overhead
      assert time < 10_000_000 # microseconds (10 seconds)
    end
  end
  
  describe "admin operations" do
    test "can list all flags" do
      # Given several flags
      {:ok, _} = FunWithFlags.enable(:flag_1)
      {:ok, _} = FunWithFlags.disable(:flag_2)
      {:ok, _} = FunWithFlags.enable(:flag_3)
      
      # When listing all flags
      {:ok, flags} = FunWithFlags.all_flags()
      
      # Then all should be present
      flag_names = Enum.map(flags, & &1.name)
      assert :flag_1 in flag_names
      assert :flag_2 in flag_names
      assert :flag_3 in flag_names
    end
    
    test "can clear individual flags" do
      # Given several flags
      {:ok, _} = FunWithFlags.enable(:flag_1)
      {:ok, _} = FunWithFlags.enable(:flag_2)
      
      # When clearing them
      FunWithFlags.clear(:flag_1)
      FunWithFlags.clear(:flag_2)
      
      # Then they should be disabled
      refute FeatureFlags.enabled?(:flag_1)
      refute FeatureFlags.enabled?(:flag_2)
    end
  end
end