import { Router, Request, Response } from 'express'
import { ControllerResponse } from '../models/responses/ControllerResponse'
import KnexSqlUtilities from '../utils/KnexSqlUtilities'
import { FeatureService } from './Feature.service'
import { MandatoryTokenFilter } from '../middlewares/TokenFilter'
import { RequestWithUserInfo } from '../models/requests/RequestWithUserInfo'
import { UnauthorizedAccessException } from '../exceptions/UnauthorizedAccessException'
import { IDecodedTokenUser } from '../token/Token.service'
import { toMessage } from '../utils/errorUtils'

export default function createFeatureController(db: KnexSqlUtilities) {
  const router = Router()
  const featureService = new FeatureService(db)

  /**
   * Returns all active feature flags as a key→boolean map.
   * Public — no auth required.
   * @route GET /api/feature
   */
  router.get('/', async (_req: Request, res: Response) => {
    const response = new ControllerResponse(res)
    try {
      return response.ok(await featureService.getAllFlags())
    } catch (error) {
      return response.ko(toMessage(error))
    }
  })

  /**
   * Toggles a feature flag on or off.
   * Requires SYSTEM_R5 role.
   * @route POST /api/feature/:key/toggle
   */
  router.post('/:key/toggle', [MandatoryTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res)
    try {
      const user = req.user as IDecodedTokenUser
      if (!user?.roles.includes('SYSTEM_R5')) throw new UnauthorizedAccessException()

      const result = await featureService.toggleFlag(req.params.key, user.username)
      return response.ok(result)
    } catch (error) {
      return response.ko(toMessage(error))
    }
  })

  return router
}
