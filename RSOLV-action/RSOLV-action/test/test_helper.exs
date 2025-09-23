ExUnit.start()

# Setup Ecto Sandbox
Ecto.Adapters.SQL.Sandbox.mode(Rsolv.Repo, :manual)

# Setup Mox Application
Application.ensure_all_started(:mox)

# Ensure FunWithFlags is started for tests
Application.ensure_all_started(:fun_with_flags)

# Replace HTTPoison with mock during testing
Application.put_env(:rsolv, :http_client, Rsolv.HTTPClientMock)

# No longer using AnalyticsStorage - removed
