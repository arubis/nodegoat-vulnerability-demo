#!/usr/bin/env bun

import { SecurityDetectorV2 } from '../src/security/detector-v2.js';

const rubyCode = `# frozen_string_literal: true
class UsersController < ApplicationController
  def update
    message = false
    
    user = User.where("id = '#{params[:user][:id]}'")[0]
    
    if user
      user.update(user_params_without_password)
    end
  end
end`;

async function test() {
  const detector = new SecurityDetectorV2();
  console.log('Testing single line Ruby code:');
  console.log('Code:', rubyCode);
  
  const vulnerabilities = await detector.detect(rubyCode, 'ruby', 'test.rb');
  console.log('\nVulnerabilities found:', vulnerabilities.length);
  console.log(JSON.stringify(vulnerabilities, null, 2));
}

test().catch(console.error);