defmodule RsolvLandingWeb.FeatureFlagsHelper do
  @moduledoc """
  Helper functions for setting up feature flags during testing.
  """

  @doc """
  Enables specified features for testing.
  
  This should be called in the setup block of tests that require
  specific features to be enabled.
  
  ## Examples
      
      setup :enable_admin_dashboards
      
      # Or manually with specific features
      setup do
        RsolvLandingWeb.FeatureFlagsHelper.enable_features([:admin_dashboard, :metrics_dashboard])
        :ok
      end
  """
  def enable_features(features) when is_list(features) do
    # Get current enabled features
    current_features = Application.get_env(:rsolv_landing, :enabled_features, [])
    
    # Add new features without duplicates
    updated_features = Enum.uniq(current_features ++ features)
    
    # Update application environment
    Application.put_env(:rsolv_landing, :enabled_features, updated_features)
  end
  
  @doc """
  Setup function to enable admin dashboard features for testing.
  
  This can be used directly in the setup block:
  
      setup :enable_admin_dashboards
  """
  def enable_admin_dashboards(_context \\ %{}) do
    enable_features([:admin_dashboard, :metrics_dashboard, :feedback_dashboard])
    :ok
  end
  
  @doc """
  Resets feature flags to their default state after tests.
  
  This should be called in an `on_exit` callback to clean up after tests.
  
  ## Examples
      
      setup do
        on_exit(fn -> RsolvLandingWeb.FeatureFlagsHelper.reset_features() end)
        :ok
      end
  """
  def reset_features do
    Application.delete_env(:rsolv_landing, :enabled_features)
    Application.delete_env(:rsolv_landing, :disabled_features)
  end
end