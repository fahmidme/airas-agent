import { Action, ActionResult } from './types';
import { playwrightService } from '../browser/playwright-service';
import { DOMService } from '../browser/dom-service';
import { logger } from '../../utils/logger';

export class ActionExecutor {
  private domService: DOMService | null = null;

  private async ensureDOMService() {
    if (!this.domService) {
      this.domService = new DOMService();
    }
    return this.domService;
  }

  async execute(action: Action): Promise<ActionResult> {
    try {
      logger.log('info', { message: 'Executing action', data: action });
      const domService = await this.ensureDOMService();

      switch (action.type) {
        case 'goto':
          await playwrightService.goto(action.url);
          break;

        case 'click': {
          // First validate the element exists and is visible
          const isValid = await domService.validateElement(action.index);
          if (!isValid) {
            throw new Error(`Element with index ${action.index} is not valid or visible`);
          }

          // Scroll element into view if needed
          await domService.scrollToElement(action.index);

          // Get element info and click
          const element = await domService.getElementByIndex(action.index);
          if (!element) {
            throw new Error(`Element with index ${action.index} not found`);
          }

          await playwrightService.clickBySelector(`[data-element-index="${action.index}"]`);
          break;
        }

        case 'type': {
          // Validate element
          const isValid = await domService.validateElement(action.index);
          if (!isValid) {
            throw new Error(`Element with index ${action.index} is not valid or visible`);
          }

          // Scroll into view
          await domService.scrollToElement(action.index);

          // Type text
          await playwrightService.typeBySelector(`[data-element-index="${action.index}"]`, action.text);
          break;
        }

        case 'scroll': {
          await domService.scrollToElement(action.index);
          break;
        }

        case 'complete':
          // No action needed for completion
          break;
      }

      // Wait for any navigation or dynamic content to load
      await playwrightService.waitForLoadState();

      // Get current state
      const currentUrl = await playwrightService.getCurrentUrl();
      const screenshot = await playwrightService.takeScreenshot();

      // Get page state with highlighted elements
      const pageState = await domService.getPageState(true);
      const formattedElements = await domService.getFormattedElements();

      return {
        success: true,
        currentUrl,
        screenshot,
        pageState: {
          title: pageState.title,
          elements: formattedElements,
          scrollPosition: pageState.scrollPosition
        }
      };

    } catch (error) {
      logger.error({
        message: 'Action execution failed',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      
      // Try to get current state even if action failed
      let currentUrl = '';
      let screenshot = '';
      let pageState = undefined;

      try {
        currentUrl = await playwrightService.getCurrentUrl();
        screenshot = await playwrightService.takeScreenshot();
        
        if (this.domService) {
          const state = await this.domService.getPageState(true);
          const elements = await this.domService.getFormattedElements();
          pageState = {
            title: state.title,
            elements,
            scrollPosition: state.scrollPosition
          };
        }
      } catch (e) {
        logger.error({
          message: 'Failed to get state after error',
          data: { error: e instanceof Error ? e.message : 'Unknown error' }
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        currentUrl,
        screenshot,
        pageState
      };
    }
  }

  async cleanup() {
    if (this.domService) {
      await this.domService.cleanup();
      this.domService = null;
    }
  }
}

// Export singleton instance
export const actionExecutor = new ActionExecutor(); 